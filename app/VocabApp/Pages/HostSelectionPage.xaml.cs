using System.Globalization;
using VocabApp.Models;
using VocabApp.Services;

namespace VocabApp.Pages
{
    /// <summary>Bool → star color (gold when favorite, grey otherwise).</summary>
    public class FavoriteColorConverter : IValueConverter
    {
        public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
            => value is true ? Colors.Gold : Colors.Gray;
        public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
            => throw new NotSupportedException();
    }

    public partial class HostSelectionPage : ContentPage
    {
        private List<KnownHost> knownHosts = new();

        public HostSelectionPage()
        {
            InitializeComponent();
            Resources.Add("FavColor", new FavoriteColorConverter());
        }

        protected override void OnAppearing()
        {
            base.OnAppearing();
            ReloadHosts();
        }

        private void ReloadHosts()
        {
            knownHosts = HostStore.SortHosts(HostStore.GetHosts());
            HostsView.ItemsSource = null;
            HostsView.ItemsSource = knownHosts;
        }

        private async void OnHostTapped(object sender, TappedEventArgs eventArgs)
        {
            if (eventArgs.Parameter is not KnownHost selectedHost) return;
            HostStore.SetActiveUrl(selectedHost.Url);
            await Navigation.PopAsync();
        }

        private void OnFavoriteClicked(object sender, EventArgs eventArgs)
        {
            if (sender is not Button button || button.CommandParameter is not KnownHost host) return;
            host.IsFavorite = !host.IsFavorite;
            HostStore.SaveHosts(knownHosts);
            ReloadHosts();
        }

        private async void OnDeleteClicked(object sender, EventArgs eventArgs)
        {
            if (sender is not Button button || button.CommandParameter is not KnownHost hostToDelete) return;
            bool confirmed = await DisplayAlertAsync("Delete server",
                $"Remove \"{hostToDelete.Name}\" from the list?", "Delete", "Cancel");
            if (!confirmed) return;

            knownHosts.RemoveAll(host => host.Url == hostToDelete.Url);
            HostStore.SaveHosts(knownHosts);
            if (HostStore.GetActiveUrl() == hostToDelete.Url) HostStore.SetActiveUrl(string.Empty);
            ReloadHosts();
        }

        private async void OnAddClicked(object sender, EventArgs eventArgs)
        {
            ErrorLabel.IsVisible = false;
            string? normalizedUrl = HostStore.NormalizeUrl(UrlEntry.Text ?? string.Empty);
            if (normalizedUrl is null)
            {
                ErrorLabel.Text = "That doesn't look like a valid URL.";
                ErrorLabel.IsVisible = true;
                return;
            }
            string displayName = (NameEntry.Text ?? string.Empty).Trim();
            if (displayName.Length == 0) displayName = new Uri(normalizedUrl).Host;

            var existingHost = knownHosts.FirstOrDefault(host => host.Url == normalizedUrl);
            if (existingHost is not null) existingHost.Name = displayName;
            else knownHosts.Add(new KnownHost { Name = displayName, Url = normalizedUrl });

            HostStore.SaveHosts(knownHosts);
            HostStore.SetActiveUrl(normalizedUrl);
            await Navigation.PopAsync();
        }
    }
}
