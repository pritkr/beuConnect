package com.longbridge.nsh;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;

/**
 * BEUConnect's Android host.
 *
 * It is the stock standalone host (edge-to-edge window, one NshView, the
 * bundle in assets/nsh) plus one thing the stock host does not have: a
 * registered `PdfPage` component, so the app can show a PDF with Android's own
 * PdfRenderer instead of a WebView. Living in com.longbridge.nsh is what makes
 * DevActivity.edgeToEdge and NshView.useStandaloneLimits reachable: the stock
 * host does exactly the same three calls.
 */
public final class MainActivity extends Activity {
    private NshView view;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        DevActivity.edgeToEdge(this);
        view = new NshView(this);
        view.useStandaloneLimits();
        view.registerComponent("PdfPage", context -> new PdfPageComponent(context, this));
        view.registerComponent("AskAi", context -> new AskAiComponent(context, this));
        setContentView(view);
        view.loadAssetBundle("nsh");

        // Android 9 has no MediaStore Downloads collection; saving a PDF there
        // writes the public Downloads folder, which needs this one grant.
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                && checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.WRITE_EXTERNAL_STORAGE}, 1);
        }
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        DevActivity.systemBars(this);
    }

    @Override
    public void onBackPressed() {
        if (view == null || !view.handleBack()) super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (view != null) view.destroy();
        super.onDestroy();
    }
}
