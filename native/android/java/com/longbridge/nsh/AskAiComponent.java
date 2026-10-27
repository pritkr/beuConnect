package com.longbridge.nsh;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.view.View;

import java.util.HashMap;
import java.util.Map;

/**
 * "Ask AI": hand a finished prompt to the system's app chooser.
 *
 * A plain https link cannot carry a prompt into an Android app: Claude and
 * ChatGPT open on a blank screen, Gemini ignores the query. So the host does
 * what the share sheet does — `ACTION_SEND` with the text — and lets Android
 * pick the target. The chooser lists every assistant the student has installed
 * (Claude, ChatGPT, Gemini, DeepSeek, …), in their own order, and a new app is
 * there the day it is installed. Nothing here needs to know their packages.
 *
 * The view is invisible and takes no space: only the command matters.
 */
final class AskAiComponent implements NshComponent {
    private final NshComponentContext bridge;
    private final Activity activity;
    private final View view;

    AskAiComponent(NshComponentContext context, Activity activity) {
        this.bridge = context;
        this.activity = activity;
        this.view = new View(activity);
        this.view.setVisibility(View.GONE);
    }

    @Override
    public View view() {
        return view;
    }

    @Override
    public void setProp(String name, Object value) {
        // No props: the prompt travels with the command, so it is always fresh.
    }

    @Override
    public void command(String name, Object value) {
        if (!"open".equals(name) || !(value instanceof Map)) return;
        Map<?, ?> args = (Map<?, ?>) value;
        String prompt = args.get("prompt") == null ? "" : String.valueOf(args.get("prompt"));
        if (prompt.trim().isEmpty()) {
            emit("fail", "There is nothing to ask.");
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, prompt);
        try {
            activity.startActivity(Intent.createChooser(send, "Ask AI"));
            emit("opened", "");
        } catch (ActivityNotFoundException | SecurityException none) {
            // No app on the device accepts text: keep the prompt readable.
            copy(prompt);
            emit("fail", "No app could take the prompt. It is on the clipboard.");
        }
    }

    private void copy(String prompt) {
        try {
            ClipboardManager clipboard =
                    (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("Ask AI", prompt));
        } catch (RuntimeException ignored) {
        }
    }

    private void emit(String name, String app) {
        Map<String, Object> event = new HashMap<>();
        event.put("app", app);
        bridge.emit(name, event);
    }

    @Override
    public void destroy() {
    }
}
