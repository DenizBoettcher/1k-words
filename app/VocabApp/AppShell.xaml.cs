using VocabApp.Pages;

namespace VocabApp
{
    public partial class AppShell : Shell
    {
        public AppShell()
        {
            InitializeComponent();
            Routing.RegisterRoute(nameof(HostSelectionPage), typeof(HostSelectionPage));
        }
    }
}
