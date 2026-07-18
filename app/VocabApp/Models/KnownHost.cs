namespace VocabApp.Models
{
    /// <summary>A saved server the app can connect to.</summary>
    public class KnownHost
    {
        public string Name { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
        public bool IsFavorite { get; set; }
    }
}
