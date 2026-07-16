namespace VocabApp
{
    public static class AppConfig
    {
        // Seed URL for the default "Cloud" entry in the known-hosts list
        // (Services/HostStore.cs). Users can add/select other servers in the
        // app; this value is only used the first time the list is created.
#if DEBUG
        public const string ApiUrl = "http://localhost:8787";
#else
        public const string ApiUrl = "https://1k-words.YOUR-SUBDOMAIN.workers.dev";
#endif
    }
}
