using VocabApp.Models;
using VocabApp.Pages;
using VocabApp.Services;

namespace VocabApp
{
    public partial class MainPage : ContentPage
    {
        private string? loadedUrl;
        private bool hostPagePushed;
        private bool reminderRestored;

        public MainPage()
        {
            InitializeComponent();

#if ANDROID
            // Let the WebView use the microphone (SPEAK mode / speech recognition).
            Microsoft.Maui.Handlers.WebViewHandler.Mapper.AppendToMapping(
                "SpeechPermissions",
                (handler, view) => handler.PlatformView.SetWebChromeClient(
                    new Platforms.Android.SpeechWebChromeClient(handler)));
#endif
        }

        protected override async void OnAppearing()
        {
            base.OnAppearing();

            if (!reminderRestored)
            {
                reminderRestored = true;
                await ReminderService.RestoreAsync();
                _ = Permissions.RequestAsync<Permissions.Microphone>(); // for SPEAK mode
            }

            string? activeUrl = HostStore.GetActiveUrl();
            if (activeUrl is null)
            {
                // First start (or the active server was deleted): pick one.
                if (!hostPagePushed)
                {
                    hostPagePushed = true;
                    await Navigation.PushAsync(new HostSelectionPage());
                }
                return;
            }

            hostPagePushed = false;
            // Show WHICH server we're on in the slim native bar (top-left).
            KnownHost? activeHost = HostStore.GetHosts().FirstOrDefault(host => host.Url == activeUrl);
            Title = activeHost?.Name ?? new Uri(activeUrl).Host;
            if (loadedUrl != activeUrl)
            {
                loadedUrl = activeUrl;
                Viewer.Source = activeUrl;
            }
        }

        private async void OnServersClicked(object sender, EventArgs eventArgs)
        {
            await Navigation.PushAsync(new HostSelectionPage());
        }

        private async void OnReminderClicked(object sender, EventArgs eventArgs)
        {
            await Navigation.PushAsync(new ReminderPage());
        }

        private void OnReloadClicked(object sender, EventArgs eventArgs)
        {
            Viewer.Reload();
        }

        /// <summary>Server unreachable → offer the server list instead of a blank page.</summary>
        private async void OnViewerNavigated(object sender, WebNavigatedEventArgs eventArgs)
        {
            if (eventArgs.Result == WebNavigationResult.Success) return;

            bool openServers = await DisplayAlertAsync(
                "Can't reach the server",
                $"Failed to load {eventArgs.Url} ({eventArgs.Result}). Is the server running?",
                "Choose server", "Retry");

            if (openServers)
            {
                loadedUrl = null; // force reload after coming back
                await Navigation.PushAsync(new HostSelectionPage());
            }
            else
            {
                Viewer.Reload();
            }
        }

        /// <summary>Android back button: navigate back inside the web app first.</summary>
        protected override bool OnBackButtonPressed()
        {
            if (Viewer.CanGoBack)
            {
                Viewer.GoBack();
                return true;
            }
            return base.OnBackButtonPressed();
        }
    }
}
