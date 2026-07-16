using System.Text.Json;
using VocabApp.Models;

namespace VocabApp.Services
{
    /// <summary>
    /// Persists the list of known hosts and the currently selected one using
    /// MAUI Preferences (survives app restarts, per device).
    /// </summary>
    public static class HostStore
    {
        private const string HostsPreferenceKey = "knownHosts";
        private const string ActiveUrlPreferenceKey = "activeHostUrl";

        private static readonly JsonSerializerOptions SerializerOptions = new() { WriteIndented = false };

        public static List<KnownHost> GetHosts()
        {
            var storedJson = Preferences.Default.Get(HostsPreferenceKey, string.Empty);
            if (!string.IsNullOrWhiteSpace(storedJson))
            {
                try
                {
                    var parsedHosts = JsonSerializer.Deserialize<List<KnownHost>>(storedJson);
                    if (parsedHosts is { Count: > 0 }) return parsedHosts;
                }
                catch
                {
                    // Corrupted storage  fall through and reseed the defaults.
                }
            }

            var defaults = DefaultHosts();
            SaveHosts(defaults);
            return defaults;
        }

        public static void SaveHosts(List<KnownHost> hosts)
        {
            Preferences.Default.Set(HostsPreferenceKey, JsonSerializer.Serialize(hosts, SerializerOptions));
        }

        public static string? GetActiveUrl()
        {
            var activeUrl = Preferences.Default.Get(ActiveUrlPreferenceKey, string.Empty);
            return string.IsNullOrWhiteSpace(activeUrl) ? null : activeUrl;
        }

        public static void SetActiveUrl(string url)
        {
            Preferences.Default.Set(ActiveUrlPreferenceKey, url);
        }

        /// <summary>
        /// Trim, add https:// when no scheme was typed, drop a trailing slash.
        /// Returns null when the result is not a valid absolute http(s) URL.
        /// </summary>
        public static string? NormalizeUrl(string rawInput)
        {
            var candidate = rawInput.Trim();
            if (candidate.Length == 0) return null;

            if (!candidate.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                !candidate.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                candidate = "https://" + candidate;
            }

            candidate = candidate.TrimEnd('/');

            return Uri.TryCreate(candidate, UriKind.Absolute, out var parsedUri) &&
                   (parsedUri.Scheme == Uri.UriSchemeHttp || parsedUri.Scheme == Uri.UriSchemeHttps)
                ? candidate
                : null;
        }

        private static List<KnownHost> DefaultHosts()
        {
            var defaults = new List<KnownHost>
            {
                new() { Name = "Cloud", Url = AppConfig.ApiUrl },
            };
#if DEBUG
            defaults.Add(new KnownHost { Name = "Local dev (this machine)", Url = "http://localhost:8787" });
            defaults.Add(new KnownHost { Name = "Android emulator → host PC", Url = "http://10.0.2.2:8787" });
#endif
            return defaults;
        }
    }
}
