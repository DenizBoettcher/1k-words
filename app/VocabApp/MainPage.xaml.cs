namespace VocabApp
{
    public partial class MainPage : ContentPage
    {
        const string SiteUrl = "http://localhost:3000";

        public MainPage()
        {
            InitializeComponent();
            Viewer.Source = SiteUrl;
        }
    }
}
