package com.longbridge.nsh;

import android.app.Activity;
import android.content.ContentValues;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.VelocityTracker;
import android.view.View;
import android.widget.Scroller;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * One continuous column of pages, drawn by Android's own PdfRenderer.
 *
 * This is the shape every reader the student already knows has: the pages run
 * down one surface, a finger drags them, a fling keeps going, pinch zooms into
 * the text, double tap toggles 1x and 2.5x. There are no page buttons — the
 * page number follows the scroll instead.
 *
 * No WebView, no JavaScript, no server-side rasterization: the file is
 * downloaded once to the app's cache, rendered by the platform at the screen's
 * density, and the same file can be handed to the user's Downloads folder.
 */
final class PdfPageView extends View {
    /** The widest bitmap worth keeping in memory; text stays sharp well below this. */
    private static final int MAX_BITMAP_WIDTH = 1536;
    /** Pages kept rendered around the viewport; more would only cost heap. */
    private static final int CACHE_PAGES = 4;
    private static final float MAX_ZOOM = 6f;

    private static final int BACKGROUND = 0xFFEFEAE3;
    private static final int SHADOW = 0x1A000000;

    private final NshComponentContext bridge;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Object rendererLock = new Object();
    private final Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
    private final Paint paper = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint loadingPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Matrix matrix = new Matrix();
    private final RectF source = new RectF();
    private final RectF destination = new RectF();
    private final ScaleGestureDetector zoom;
    private final GestureDetector taps;
    private final Scroller fling;
    private final LinkedHashMap<Integer, Bitmap> pages =
            new LinkedHashMap<Integer, Bitmap>(8, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<Integer, Bitmap> eldest) {
                    if (size() <= CACHE_PAGES) return false;
                    eldest.getValue().recycle();
                    return true;
                }
            };
    private final Map<Integer, Integer> renderedWidths = new HashMap<>();
    private final Map<Integer, Integer> inFlight = new HashMap<>();

    private String sourceUrl;
    private String downloadName;
    private File file;
    private ParcelFileDescriptor descriptor;
    private PdfRenderer renderer;
    private int[] pageWidths;
    private int[] pageHeights;
    private float[] baseTops;
    private float[] baseWidths;
    private float[] baseHeights;
    private int pageCount;
    private int currentPage;
    private float fit = 1f;
    private float scale = 1f;
    private float scrollX;
    private float scrollY;
    private boolean loading;
    private boolean zooming;
    private boolean dragging;
    private int request;

    private float lastX;
    private float lastY;
    private VelocityTracker velocity;

    private int pad;
    private int gap;

    PdfPageView(NshComponentContext context, Activity activity) {
        super(activity);
        this.bridge = context;
        pad = Math.round(10 * getResources().getDisplayMetrics().density);
        gap = Math.round(12 * getResources().getDisplayMetrics().density);
        paper.setColor(Color.WHITE);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(1f);
        border.setColor(SHADOW);
        setBackgroundColor(BACKGROUND);
        fling = new Scroller(activity);
        zoom = new ScaleGestureDetector(activity, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScaleBegin(ScaleGestureDetector detector) {
                zooming = true;
                fling.forceFinished(true);
                return true;
            }

            @Override
            public boolean onScale(ScaleGestureDetector detector) {
                float next = clamp(scale * detector.getScaleFactor(), 1f, MAX_ZOOM);
                if (next == scale) return true;
                // Keep the words under the fingers where they are.
                float bx = (detector.getFocusX() - originX() + scrollX) / scale;
                float by = (detector.getFocusY() + scrollY) / scale;
                scale = next;
                scrollX = originX() + bx * scale - detector.getFocusX();
                scrollY = by * scale - detector.getFocusY();
                clampScroll();
                invalidate();
                return true;
            }

            @Override
            public void onScaleEnd(ScaleGestureDetector detector) {
                zooming = false;
                invalidate();
            }
        });
        taps = new GestureDetector(activity, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDown(MotionEvent event) {
                return true;
            }

            @Override
            public boolean onDoubleTap(MotionEvent event) {
                float next = scale > 1.05f ? 1f : 2.5f;
                float bx = (event.getX() - originX() + scrollX) / scale;
                float by = (event.getY() + scrollY) / scale;
                scale = next;
                scrollX = originX() + bx * scale - event.getX();
                scrollY = by * scale - event.getY();
                clampScroll();
                invalidate();
                return true;
            }
        });
    }

    /* ------------------------------------------------------------- loading */

    void setSource(String url) {
        if (url == null || url.equals(sourceUrl)) return;
        sourceUrl = url;
        pageCount = 0;
        currentPage = 0;
        pageWidths = null;
        pageHeights = null;
        scale = 1f;
        scrollX = 0f;
        scrollY = 0f;
        dropPages();
        closeRenderer();
        final int ticket = ++request;
        loading = true;
        invalidate();
        final String target = url;
        io.execute(() -> {
            File cached;
            try {
                cached = cacheFile(target);
            } catch (IOException error) {
                fail(ticket, "Could not download this PDF. Check the connection and try again.");
                return;
            }
            post(() -> {
                if (ticket != request) return;
                file = cached;
                open(ticket);
            });
        });
    }

    private void open(int ticket) {
        io.execute(() -> {
            int[] widths;
            int[] heights;
            synchronized (rendererLock) {
                if (ticket != request) return;
                try {
                    descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
                    renderer = new PdfRenderer(descriptor);
                    int count = renderer.getPageCount();
                    if (count == 0) {
                        fail(ticket, "This PDF has no pages.");
                        return;
                    }
                    widths = new int[count];
                    heights = new int[count];
                    for (int index = 0; index < count; index++) {
                        PdfRenderer.Page page = renderer.openPage(index);
                        widths[index] = page.getWidth();
                        heights[index] = page.getHeight();
                        page.close();
                    }
                } catch (IOException | RuntimeException error) {
                    fail(ticket, "This PDF could not be opened. It may be damaged or protected.");
                    return;
                }
            }
            final int[] readyWidths = widths;
            final int[] readyHeights = heights;
            post(() -> {
                if (ticket != request) return;
                pageWidths = readyWidths;
                pageHeights = readyHeights;
                pageCount = readyWidths.length;
                loading = false;
                layoutPages();
                Map<String, Object> event = new HashMap<>();
                event.put("pages", pageCount);
                emit("ready", event);
                invalidate();
            });
        });
    }

    private File cacheFile(String url) throws IOException {
        String name = sha1(url) + ".pdf";
        File directory = new File(getContext().getCacheDir(), "pdf");
        if (!directory.exists() && !directory.mkdirs()) throw new IOException("no cache directory");
        File target = new File(directory, name);
        if (target.length() > 1024) return target;
        File partial = new File(directory, name + ".part");
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(120000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("accept", "application/pdf,*/*");
        connection.setRequestProperty("user-agent", "BEUConnect/1.0 (Android)");
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            connection.disconnect();
            throw new IOException("HTTP " + status);
        }
        try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(partial)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) > 0) output.write(buffer, 0, read);
        } finally {
            connection.disconnect();
        }
        if (!partial.renameTo(target)) throw new IOException("could not keep the file");
        return target;
    }

    private void fail(int ticket, String message) {
        post(() -> {
            if (ticket != request) return;
            loading = false;
            Map<String, Object> event = new HashMap<>();
            event.put("message", message);
            emit("fail", event);
            invalidate();
        });
    }

    /* ------------------------------------------------------------- layout */

    /** Fit-to-width in base units; zoom is a multiplier on top of this. */
    private void layoutPages() {
        if (pageCount == 0 || pageWidths == null || getWidth() == 0) return;
        int widest = 1;
        for (int width : pageWidths) widest = Math.max(widest, width);
        fit = Math.max(0.01f, (getWidth() - 2f * pad) / widest);
        baseTops = new float[pageCount];
        baseWidths = new float[pageCount];
        baseHeights = new float[pageCount];
        float top = pad;
        for (int index = 0; index < pageCount; index++) {
            baseTops[index] = top;
            baseWidths[index] = pageWidths[index] * fit;
            baseHeights[index] = pageHeights[index] * fit;
            top += baseHeights[index] + gap;
        }
        clampScroll();
    }

    private float baseContentWidth() {
        if (baseWidths == null) return 0f;
        float widest = 0f;
        for (float width : baseWidths) widest = Math.max(widest, width);
        return widest;
    }

    private float baseContentHeight() {
        if (pageCount == 0 || baseTops == null) return 0f;
        return baseTops[pageCount - 1] + baseHeights[pageCount - 1] + pad;
    }

    private float originX() {
        return (getWidth() - baseContentWidth() * scale) / 2f;
    }

    private float maxScrollX() {
        return Math.max(0f, baseContentWidth() * scale - getWidth());
    }

    private float maxScrollY() {
        return Math.max(0f, baseContentHeight() * scale - getHeight());
    }

    private void clampScroll() {
        scrollX = clamp(scrollX, 0f, maxScrollX());
        scrollY = clamp(scrollY, 0f, maxScrollY());
    }

    private void pageRect(int index, RectF out) {
        float left = originX() - scrollX + (baseContentWidth() - baseWidths[index]) / 2f * scale;
        float top = baseTops[index] * scale - scrollY;
        out.set(left, top, left + baseWidths[index] * scale, top + baseHeights[index] * scale);
    }

    /* ------------------------------------------------------------ drawing */

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (loading && pageCount == 0) {
            drawNotice(canvas, "Opening the PDF");
            return;
        }
        if (pageCount == 0 || baseTops == null) return;

        int firstVisible = -1;
        int lastVisible = -1;
        for (int index = 0; index < pageCount; index++) {
            pageRect(index, destination);
            if (destination.bottom < -gap || destination.top > getHeight() + gap) continue;
            if (firstVisible < 0) firstVisible = index;
            lastVisible = index;

            canvas.drawRect(destination, paper);
            Bitmap bitmap = pages.get(index);
            if (bitmap != null) {
                source.set(0, 0, bitmap.getWidth(), bitmap.getHeight());
                matrix.setRectToRect(source, destination, Matrix.ScaleToFit.FILL);
                canvas.drawBitmap(bitmap, matrix, paint);
                if (bitmap.getWidth() + 2 < neededWidth(index)) requestPage(index);
            } else {
                requestPage(index);
            }
            // A hairline edge so the paper reads as a page, not a white block.
            canvas.drawRect(destination, border);
        }

        if (firstVisible >= 0 && firstVisible != currentPage) {
            currentPage = firstVisible;
            Map<String, Object> event = new HashMap<>();
            event.put("page", currentPage + 1);
            emit("page", event);
        }

        if (!zooming && (firstVisible >= 0 || lastVisible >= 0)) {
            // Let the neighbours warm up while the finger is still moving.
            requestPage(Math.max(0, firstVisible - 1));
            requestPage(Math.min(pageCount - 1, lastVisible + 1));
        }
    }

    private void drawNotice(Canvas canvas, String text) {
        loadingPaint.setColor(0xFF6A5E4F);
        loadingPaint.setTextSize(getResources().getDisplayMetrics().scaledDensity * 14f);
        loadingPaint.setTextAlign(Paint.Align.CENTER);
        canvas.drawText(text, getWidth() / 2f, getHeight() / 2f, loadingPaint);
    }

    private int neededWidth(int index) {
        return Math.min(MAX_BITMAP_WIDTH, Math.max(480, Math.round(baseWidths[index] * scale)));
    }

    /* ----------------------------------------------------------- rendering */

    private void requestPage(int index) {
        if (index < 0 || index >= pageCount || renderer == null) return;
        if (inFlight.containsKey(index)) return;
        Integer have = renderedWidths.get(index);
        int need = neededWidth(index);
        if (have != null && have >= need - 8) return;
        final int width = need;
        final int ticket = request;
        inFlight.put(index, width);
        io.execute(() -> {
            Bitmap bitmap = null;
            try {
                bitmap = render(index, width);
            } finally {
                final Bitmap ready = bitmap;
                post(() -> {
                    inFlight.remove(index);
                    if (ready == null) return;
                    if (ticket != request) {
                        ready.recycle();
                        return;
                    }
                    Bitmap previous = pages.put(index, ready);
                    if (previous != null && previous != ready) previous.recycle();
                    renderedWidths.put(index, width);
                    invalidate();
                });
            }
        });
    }

    private Bitmap render(int index, int width) {
        synchronized (rendererLock) {
            if (renderer == null || index >= pageCount) return null;
            int height = Math.max(1, Math.round(width * (pageHeights[index] / (float) pageWidths[index])));
            Bitmap bitmap;
            try {
                bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            } catch (OutOfMemoryError error) {
                return null;
            }
            bitmap.eraseColor(Color.WHITE);
            PdfRenderer.Page page = renderer.openPage(index);
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            page.close();
            return bitmap;
        }
    }

    private void dropPages() {
        for (Bitmap bitmap : pages.values()) bitmap.recycle();
        pages.clear();
        renderedWidths.clear();
    }

    /* ------------------------------------------------------------- paging */

    /** Scrolls so page {@code oneBased} sits at the top of the view. */
    void setPage(int oneBased) {
        if (pageCount == 0 || baseTops == null) return;
        int index = Math.max(0, Math.min(pageCount - 1, oneBased - 1));
        scrollY = baseTops[index] * scale;
        clampScroll();
        invalidate();
    }

    void nextPage() {
        scrollY += getHeight() * 0.9f;
        clampScroll();
        invalidate();
    }

    void previousPage() {
        scrollY -= getHeight() * 0.9f;
        clampScroll();
        invalidate();
    }

    void zoomTo(float level) {
        scale = clamp(level, 1f, MAX_ZOOM);
        clampScroll();
        invalidate();
    }

    /* ---------------------------------------------------------- download */

    void reload() {
        String current = sourceUrl;
        if (current == null) return;
        File cached = new File(new File(getContext().getCacheDir(), "pdf"), sha1(current) + ".pdf");
        if (cached.exists() && !cached.delete()) cached = null;
        sourceUrl = null;
        setSource(current);
    }

    void setDownloadName(String value) {
        downloadName = value;
    }

    void download() {
        final File sourceFile = file;
        if (sourceFile == null) {
            Map<String, Object> event = new HashMap<>();
            event.put("message", "Open the PDF before saving it.");
            emit("fail", event);
            return;
        }
        final String display = downloadFileName();
        io.execute(() -> {
            try {
                String where = save(sourceFile, display);
                Map<String, Object> event = new HashMap<>();
                event.put("name", display);
                event.put("path", where);
                emit("saved", event);
            } catch (IOException | SecurityException error) {
                Map<String, Object> event = new HashMap<>();
                event.put("message", "Could not save the PDF to Downloads.");
                emit("fail", event);
            }
        });
    }

    private String downloadFileName() {
        String base = downloadName;
        if (base == null || base.trim().isEmpty()) {
            base = sourceUrl == null ? "BEUConnect" : sourceUrl.substring(sourceUrl.lastIndexOf('/') + 1);
            if (base.endsWith(".pdf")) base = base.substring(0, base.length() - 4);
        }
        base = base.replaceAll("[\\\\/:*?\"<>|]+", "-").trim();
        if (base.isEmpty()) base = "BEUConnect";
        if (!base.toLowerCase().endsWith(".pdf")) base = base + ".pdf";
        return base;
    }

    private String save(File sourceFile, String display) throws IOException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, display);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/BEUConnect");
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri item = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (item == null) throw new IOException("no downloads collection");
            try (InputStream input = new java.io.FileInputStream(sourceFile);
                 OutputStream output = getContext().getContentResolver().openOutputStream(item)) {
                if (output == null) throw new IOException("no stream");
                copy(input, output);
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            getContext().getContentResolver().update(item, values, null, null);
            return "Downloads/BEUConnect/" + display;
        }
        File directory = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "BEUConnect");
        if (!directory.exists() && !directory.mkdirs()) throw new IOException("no downloads directory");
        File target = new File(directory, display);
        try (InputStream input = new java.io.FileInputStream(sourceFile); OutputStream output = new FileOutputStream(target)) {
            copy(input, output);
        }
        return target.getAbsolutePath();
    }

    private static void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = input.read(buffer)) > 0) output.write(buffer, 0, read);
        output.flush();
    }

    /* ------------------------------------------------------------- input */

    @Override
    protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        super.onSizeChanged(width, height, oldWidth, oldHeight);
        layoutPages();
        invalidate();
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        zoom.onTouchEvent(event);
        taps.onTouchEvent(event);

        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                fling.forceFinished(true);
                dragging = false;
                if (velocity == null) velocity = VelocityTracker.obtain();
                else velocity.clear();
                velocity.addMovement(event);
                lastX = event.getX();
                lastY = event.getY();
                break;
            case MotionEvent.ACTION_POINTER_DOWN:
                dragging = false;
                break;
            case MotionEvent.ACTION_POINTER_UP: {
                int up = event.getActionIndex();
                int keep = up == 0 ? 1 : 0;
                lastX = event.getX(keep);
                lastY = event.getY(keep);
                break;
            }
            case MotionEvent.ACTION_MOVE:
                if (velocity != null) velocity.addMovement(event);
                if (!zooming && event.getPointerCount() == 1) {
                    float dx = event.getX() - lastX;
                    float dy = event.getY() - lastY;
                    if (Math.abs(dx) + Math.abs(dy) > 2f) dragging = true;
                    scrollX -= dx;
                    scrollY -= dy;
                    clampScroll();
                    invalidate();
                }
                lastX = event.getX();
                lastY = event.getY();
                break;
            case MotionEvent.ACTION_UP:
                if (dragging && velocity != null) {
                    velocity.computeCurrentVelocity(1000, 6000f);
                    fling.fling(Math.round(scrollX), Math.round(scrollY),
                            -Math.round(velocity.getXVelocity()), -Math.round(velocity.getYVelocity()),
                            0, Math.round(maxScrollX()), 0, Math.round(maxScrollY()));
                    postInvalidateOnAnimation();
                }
                releaseVelocity();
                break;
            case MotionEvent.ACTION_CANCEL:
                releaseVelocity();
                break;
            default:
                break;
        }
        return true;
    }

    private void releaseVelocity() {
        if (velocity != null) {
            velocity.recycle();
            velocity = null;
        }
        dragging = false;
    }

    @Override
    public void computeScroll() {
        if (fling.computeScrollOffset()) {
            scrollX = fling.getCurrX();
            scrollY = fling.getCurrY();
            clampScroll();
            postInvalidateOnAnimation();
        }
    }

    private static float clamp(float value, float low, float high) {
        return Math.max(low, Math.min(high, value));
    }

    /* --------------------------------------------------------- lifecycle */

    private void closeRenderer() {
        synchronized (rendererLock) {
            if (renderer != null) {
                try {
                    renderer.close();
                } catch (RuntimeException ignored) {
                }
                renderer = null;
            }
            if (descriptor != null) {
                try {
                    descriptor.close();
                } catch (IOException ignored) {
                }
                descriptor = null;
            }
        }
    }

    void close() {
        request++;
        dropPages();
        closeRenderer();
        io.shutdownNow();
    }

    private void emit(String name, Map<String, Object> data) {
        post(() -> bridge.emit(name, data));
    }

    private static String sha1(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] bytes = digest.digest(text.getBytes("UTF-8"));
            StringBuilder out = new StringBuilder(bytes.length * 2);
            for (byte value : bytes) out.append(String.format("%02x", value));
            return out.toString();
        } catch (Exception error) {
            return Integer.toHexString(text.hashCode());
        }
    }
}
