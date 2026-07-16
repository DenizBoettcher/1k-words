using VocabApp.Pages;
using VocabApp.Services;

namespace VocabApp
{
    public partial class MainPage : ContentPage
    {
        private string? loadedUrl;
        private bool hostPagePushed;

        public MainPage()
        {
            InitializeComponent();
        }

        protected override async void OnAppearing()
        {
            base.OnAppearing();

            var activeUrl = HostStore.GetActiveUrl();
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
