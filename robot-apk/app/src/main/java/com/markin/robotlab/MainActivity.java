package com.markin.robotlab;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private static final int REQ_RECORD_AUDIO = 4107;
    private WebView webView;
    private SpeechRecognizer speechRecognizer;
    private TextToSpeech textToSpeech;
    private boolean ttsReady = false;
    private String pendingRecognitionLanguage = "ru-RU";

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(214, 219, 226));
        window.setNavigationBarColor(Color.rgb(214, 219, 226));
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        int systemUi = View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            systemUi |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            systemUi |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        window.getDecorView().setSystemUiVisibility(systemUi);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(true);
        }

        textToSpeech = new TextToSpeech(this, this);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(214, 219, 226));
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new VoiceBridge(), "AndroidVoice");

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.requestFocus(View.FOCUS_DOWN);

        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS && textToSpeech != null) {
            ttsReady = true;
            try {
                textToSpeech.setLanguage(Locale.getDefault());
            } catch (Exception ignored) {
            }
            textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                    callJs("window.NativeVoice&&NativeVoice._onTtsStart&&NativeVoice._onTtsStart();");
                }

                @Override
                public void onDone(String utteranceId) {
                    callJs("window.NativeVoice&&NativeVoice._onTtsDone&&NativeVoice._onTtsDone();");
                }

                @Override
                public void onError(String utteranceId) {
                    callJs("window.NativeVoice&&NativeVoice._onTtsError&&NativeVoice._onTtsError('TTS error');");
                }

                @Override
                public void onError(String utteranceId, int errorCode) {
                    callJs("window.NativeVoice&&NativeVoice._onTtsError&&NativeVoice._onTtsError(" + jsQuote("TTS error " + errorCode) + ");");
                }
            });
            emitVoices();
        } else {
            ttsReady = false;
            callJs("window.NativeVoice&&NativeVoice._onTtsError&&NativeVoice._onTtsError('TextToSpeech unavailable');");
        }
    }

    private void ensureSpeechRecognizer() {
        if (speechRecognizer != null) return;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            callJs("window.NativeVoice&&NativeVoice._onError&&NativeVoice._onError('unavailable','Распознавание речи недоступно на устройстве');");
            return;
        }
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                callJs("window.NativeVoice&&NativeVoice._onListeningState&&NativeVoice._onListeningState('ready');");
            }

            @Override
            public void onBeginningOfSpeech() {
                callJs("window.NativeVoice&&NativeVoice._onListeningState&&NativeVoice._onListeningState('speech');");
            }

            @Override public void onRmsChanged(float rmsdB) { }
            @Override public void onBufferReceived(byte[] buffer) { }

            @Override
            public void onEndOfSpeech() {
                callJs("window.NativeVoice&&NativeVoice._onListeningState&&NativeVoice._onListeningState('processing');");
            }

            @Override
            public void onError(int error) {
                callJs("window.NativeVoice&&NativeVoice._onError&&NativeVoice._onError(" + error + "," + jsQuote(recognitionErrorText(error)) + ");");
            }

            @Override
            public void onResults(Bundle results) {
                String text = firstRecognition(results);
                callJs("window.NativeVoice&&NativeVoice._onResult&&NativeVoice._onResult(" + jsQuote(text) + ");");
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                String text = firstRecognition(partialResults);
                if (!text.isEmpty()) {
                    callJs("window.NativeVoice&&NativeVoice._onPartial&&NativeVoice._onPartial(" + jsQuote(text) + ");");
                }
            }

            @Override public void onEvent(int eventType, Bundle params) { }
        });
    }

    private String firstRecognition(Bundle bundle) {
        if (bundle == null) return "";
        ArrayList<String> rows = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (rows == null || rows.isEmpty() || rows.get(0) == null) return "";
        return rows.get(0);
    }

    private String recognitionErrorText(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO: return "Ошибка аудио";
            case SpeechRecognizer.ERROR_CLIENT: return "Распознавание остановлено";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "Нет доступа к микрофону";
            case SpeechRecognizer.ERROR_NETWORK: return "Ошибка сети распознавания";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "Таймаут сети распознавания";
            case SpeechRecognizer.ERROR_NO_MATCH: return "Речь не распознана";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "Распознаватель занят";
            case SpeechRecognizer.ERROR_SERVER: return "Ошибка сервиса распознавания";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "Речь не обнаружена";
            default: return "Ошибка распознавания: " + error;
        }
    }

    private void startListeningNative(String languageTag) {
        pendingRecognitionLanguage = (languageTag == null || languageTag.trim().isEmpty()) ? "ru-RU" : languageTag.trim();
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO);
            return;
        }
        ensureSpeechRecognizer();
        if (speechRecognizer == null) return;
        try {
            speechRecognizer.cancel();
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, pendingRecognitionLanguage);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, pendingRecognitionLanguage);
            intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
            speechRecognizer.startListening(intent);
        } catch (Exception e) {
            callJs("window.NativeVoice&&NativeVoice._onError&&NativeVoice._onError('start'," + jsQuote(e.getMessage() == null ? "Не удалось включить распознавание" : e.getMessage()) + ");");
        }
    }

    private void speakNative(String text, String voiceName, float rate, float pitch) {
        if (!ttsReady || textToSpeech == null || text == null || text.trim().isEmpty()) {
            callJs("window.NativeVoice&&NativeVoice._onTtsError&&NativeVoice._onTtsError('TextToSpeech ещё не готов');");
            return;
        }
        try {
            if (voiceName != null && !voiceName.trim().isEmpty()) {
                Set<Voice> voices = textToSpeech.getVoices();
                if (voices != null) {
                    for (Voice voice : voices) {
                        if (voice != null && voiceName.equals(voice.getName())) {
                            textToSpeech.setVoice(voice);
                            break;
                        }
                    }
                }
            }
            textToSpeech.setSpeechRate(clamp(rate, 0.5f, 1.6f));
            textToSpeech.setPitch(clamp(pitch, 0.5f, 1.6f));
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
            String utteranceId = "robot-" + System.currentTimeMillis();
            int result = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
            if (result == TextToSpeech.ERROR) {
                callJs("window.NativeVoice&&NativeVoice._onTtsError&&NativeVoice._onTtsError('Не удалось запустить озвучку');");
            }
        } catch (Exception e) {
            callJs("window.NativeVoice&&NativeVoice._onTtsError&&NativeVoice._onTtsError(" + jsQuote(e.getMessage() == null ? "Ошибка TextToSpeech" : e.getMessage()) + ");");
        }
    }

    private float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    private void emitVoices() {
        if (!ttsReady || textToSpeech == null) {
            callJs("window.NativeVoice&&NativeVoice._onVoices&&NativeVoice._onVoices('[]');");
            return;
        }
        JSONArray arr = new JSONArray();
        try {
            Set<Voice> voices = textToSpeech.getVoices();
            if (voices != null) {
                for (Voice voice : voices) {
                    if (voice == null) continue;
                    JSONObject row = new JSONObject();
                    row.put("name", voice.getName());
                    row.put("locale", voice.getLocale() == null ? "" : voice.getLocale().toLanguageTag());
                    row.put("network", voice.isNetworkConnectionRequired());
                    row.put("quality", voice.getQuality());
                    row.put("latency", voice.getLatency());
                    arr.put(row);
                }
            }
        } catch (Exception ignored) {
        }
        callJs("window.NativeVoice&&NativeVoice._onVoices&&NativeVoice._onVoices(" + jsQuote(arr.toString()) + ");");
    }

    private String jsQuote(String value) {
        return JSONObject.quote(value == null ? "" : value);
    }

    private void callJs(final String javascript) {
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(javascript, null);
        });
    }

    public class VoiceBridge {
        @JavascriptInterface
        public void startListening(final String languageTag) {
            runOnUiThread(() -> startListeningNative(languageTag));
        }

        @JavascriptInterface
        public void stopListening() {
            runOnUiThread(() -> {
                if (speechRecognizer != null) {
                    try { speechRecognizer.cancel(); } catch (Exception ignored) { }
                }
                callJs("window.NativeVoice&&NativeVoice._onListeningState&&NativeVoice._onListeningState('stopped');");
            });
        }

        @JavascriptInterface
        public void speak(final String text, final String voiceName, final float rate, final float pitch) {
            runOnUiThread(() -> speakNative(text, voiceName, rate, pitch));
        }

        @JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(() -> {
                if (textToSpeech != null) textToSpeech.stop();
            });
        }

        @JavascriptInterface
        public void requestVoices() {
            runOnUiThread(MainActivity.this::emitVoices);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_RECORD_AUDIO) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startListeningNative(pendingRecognitionLanguage);
            } else {
                callJs("window.NativeVoice&&NativeVoice._onError&&NativeVoice._onError('permission','Доступ к микрофону не разрешён');");
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        if (speechRecognizer != null) {
            try { speechRecognizer.cancel(); } catch (Exception ignored) { }
        }
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (speechRecognizer != null) {
            try { speechRecognizer.destroy(); } catch (Exception ignored) { }
            speechRecognizer = null;
        }
        if (textToSpeech != null) {
            try { textToSpeech.stop(); textToSpeech.shutdown(); } catch (Exception ignored) { }
            textToSpeech = null;
        }
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.removeJavascriptInterface("AndroidVoice");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
