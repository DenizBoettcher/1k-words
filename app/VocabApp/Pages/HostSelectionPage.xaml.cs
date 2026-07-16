using VocabApp.Models;
using VocabApp.Services;

namespace VocabApp.Pages
{
    public partial class HostSelectionPage : ContentPage
    {
        private List<KnownHost> knownHosts = new();

        public HostSelectionPage()
        {
            InitializeComponent();
        }

        protected override void OnAppearing()
        {
            base.OnAppearing();
            ReloadHosts();
        }

        private void ReloadHosts()
        {
            knownHosts = HostStore.GetHosts();
            HostsView.ItemsSource = null;
            HostsView.ItemsSource = knownHosts;
        }

        private async void OnHostTapped(object sender, TappedEventArgs eventArgs)
        {
            if (eventArgs.Parameter is not KnownHost selectedHost) return;
            HostStore.SetActiveUrl(selectedHost.Url);
            await Navigation.PopAsync();
        }

        private void OnDeleteInvoked(object sender, EventArgs eventArgs)
        {
            if (sender is not SwipeItem swipeItem || swipeItem.CommandParameter is not KnownHost hostToDelete) return;

            knownHosts.RemoveAll(host => host.Url == hostToDelete.Url);
            HostStore.SaveHosts(knownHosts);

            // If the active host was deleted, clear the selection so MainPage
            // sends the user back here instead of loading a dead URL.
            if (HostStore.GetActiveUrl() == hostToDelete.Url)
            {
                HostStore.SetActiveUrl(string.Empty);
            }
            ReloadHosts();
        }

        private async void OnAddClicked(object sender, EventArgs eventArgs)
        {
            ErrorLabel.IsVisible = false;

            var normalizedUrl = HostStore.NormalizeUrl(UrlEntry.Text ?? string.Empty);
            if (normalizedUrl is null)
            {
                ErrorLabel.Text = "That doesn't look like a valid URL.";
                ErrorLabel.IsVisible = true;
                return;
            }

            var displayName = (NameEntry.Text ?? string.Empty).Trim();
            if (displayName.Length == 0) displayName = new Uri(normalizedUrl).Host;

            // Same URL twice just updates the name instead of duplicating.
            var existingHost = knownHosts.FirstOrDefault(host => host.Url == normalizedUrl);
            if (existingHost is not null) existingHost.Name = displayName;
            else knownHosts.Add(new KnownHost { Name = displayName, Url = normalizedUrl });

            HostStore.SaveHosts(knownHosts);
            HostStore.SetActiveUrl(normalizedUrl);
            await Navigation.PopAsync();
        }
    }
}
