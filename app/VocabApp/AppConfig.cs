namespace VocabApp
{
    public static class AppConfig
    {
#if DEBUG
        public const string ApiUrl = "https://localhost:3000";
#else
    public const string ApiUrl = "https://api.example.com";
#endif

    }
}
