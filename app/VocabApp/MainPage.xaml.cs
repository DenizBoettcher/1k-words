namespace VocabApp
{
    public partial class MainPage : ContentPage
    {
        public MainPage()
        {
            InitializeComponent();
            Viewer.Source = AppConfig.ApiUrl;
        }
    }
}
