package com.longbridge.nsh;

import android.app.Activity;
import android.view.View;

import java.util.Map;

/**
 * The `PdfPage` component: Android's PdfRenderer behind the app's native
 * component protocol.
 *
 * Props:    src (https URL of the PDF), page (1-based), name (download name).
 * Commands: next, prev, page, zoom, download.
 * Events:   ready {pages, width, height}, page {page}, fail {message}, saved {name, path}.
 */
final class PdfPageComponent implements NshComponent {
    private final PdfPageView view;

    PdfPageComponent(NshComponentContext context, Activity activity) {
        view = new PdfPageView(context, activity);
    }

    @Override
    public View view() {
        return view;
    }

    @Override
    public void setProp(String name, Object value) {
        switch (name) {
            case "src":
                view.setSource(value == null ? null : String.valueOf(value));
                break;
            case "name":
                view.setDownloadName(value == null ? null : String.valueOf(value));
                break;
            case "page":
                if (value instanceof Number) view.setPage(((Number) value).intValue());
                break;
            default:
                break;
        }
    }

    @Override
    public void command(String name, Object value) {
        switch (name) {
            case "next":
                view.nextPage();
                break;
            case "prev":
                view.previousPage();
                break;
            case "page":
                if (value instanceof Number) {
                    view.setPage(((Number) value).intValue());
                } else if (value instanceof Map) {
                    Object page = ((Map<?, ?>) value).get("page");
                    if (page instanceof Number) view.setPage(((Number) page).intValue());
                }
                break;
            case "zoom":
                if (value instanceof Number) view.zoomTo(((Number) value).floatValue());
                break;
            case "reload":
                view.reload();
                break;
            case "download":
                view.download();
                break;
            default:
                break;
        }
    }

    @Override
    public void destroy() {
        view.close();
    }

}
