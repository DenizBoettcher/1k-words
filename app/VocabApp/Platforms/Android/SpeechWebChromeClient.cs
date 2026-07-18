#if ANDROID
using Android.Webkit;
using Microsoft.Maui.Handlers;
using Microsoft.Maui.Platform;

namespace VocabApp.Platforms.Android
{
    /// <summary>
    /// Grants the WebView microphone access so the web app's SpeechRecognition
    /// (SPEAK mode) works inside the Android app. The OS-level RECORD_AUDIO
    /// runtime permission is requested separately in MainPage.
    /// </summary>
    public class SpeechWebChromeClient : MauiWebChromeClient
    {
        public SpeechWebChromeClient(IWebViewHandler handler) : base(handler) { }

        public override void OnPermissionRequest(PermissionRequest request)
        {
            request.Grant(request.GetResources());
        }
    }
}
#endif
