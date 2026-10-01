package com.helpme.test;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.ScrollView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/** Test launcher using the browser's session and secure hosted web application. */
public final class MainActivity extends Activity {
    private static final String SITE = "https://helpme-previa-adeemar.aqua-aphid-8990.chatgpt.site";
    private static final int GREEN = Color.rgb(23, 107, 88);
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @SuppressWarnings("deprecation")
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER_VERTICAL);
        page.setPadding(dp(28), dp(32), dp(28), dp(32));
        page.setBackgroundColor(Color.rgb(244, 247, 238));
        page.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(dp(28) + insets.getSystemWindowInsetLeft(), dp(32) + insets.getSystemWindowInsetTop(), dp(28) + insets.getSystemWindowInsetRight(), dp(32) + insets.getSystemWindowInsetBottom());
            return insets;
        });
        TextView title = new TextView(this);
        title.setText("Help.me"); title.setTextColor(GREEN); title.setTextSize(44);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD); page.addView(title);
        TextView intro = new TextView(this);
        intro.setText("Mais tempo para o que importa.\n\nVersão de teste para Android. A plataforma abre em uma aba segura do seu navegador e precisa de internet.");
        intro.setTextSize(18); intro.setTextColor(Color.rgb(48, 66, 58));
        intro.setPadding(0, dp(24), 0, dp(24)); page.addView(intro);
        Button open = new Button(this); open.setText("Abrir Help.me");
        open.setTextColor(Color.WHITE); open.setBackgroundTintList(android.content.res.ColorStateList.valueOf(GREEN));
        open.setOnClickListener(view -> openPlatform());
        page.addView(open, new LinearLayout.LayoutParams(-1, dp(58)));
        TextView note = new TextView(this);
        note.setText("Use sua conta existente para testar cadastro, perfis, fotos e agendamentos.\n\nOs pagamentos aguardam a ativação do Stripe.\n\nHelp.me • Intermediação de serviços\nMaravilha/SC • 0.1.0-teste");
        note.setTextSize(14); note.setTextColor(Color.rgb(90, 106, 96));
        note.setPadding(0, dp(24), 0, 0); page.addView(note);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(page);
        setContentView(scroll);
        page.requestApplyInsets();
    }

    private void openPlatform() {
        Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse(SITE));
        // Custom Tabs wire protocol; browsers without support fall back to a normal tab.
        Bundle customTabs = new Bundle();
        customTabs.putBinder("android.support.customtabs.extra.SESSION", null);
        browser.putExtras(customTabs);
        browser.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", GREEN);
        browser.putExtra("android.support.customtabs.extra.TITLE_VISIBILITY", 1);
        browser.putExtra("android.support.customtabs.extra.ENABLE_URLBAR_HIDING", true);
        try { startActivity(browser); }
        catch (ActivityNotFoundException missingBrowser) {
            Toast.makeText(this, "Instale ou habilite um navegador para abrir a Help.me.", Toast.LENGTH_LONG).show();
        }
    }
}
