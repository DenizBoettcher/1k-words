using VocabApp.Services;

namespace VocabApp.Pages
{
    public partial class ReminderPage : ContentPage
    {
        private bool suppressEvents;

        public ReminderPage()
        {
            InitializeComponent();
        }

        protected override void OnAppearing()
        {
            base.OnAppearing();
            suppressEvents = true;
            EnabledSwitch.IsToggled = ReminderService.IsEnabled;
            TimeSelector.Time = ReminderService.ReminderTime;
            suppressEvents = false;
            UpdateStatus();
        }

        private async void OnEnabledToggled(object sender, ToggledEventArgs eventArgs)
        {
            if (suppressEvents) return;

            if (eventArgs.Value)
            {
                bool enabled = await ReminderService.EnableAsync(TimeSelector.Time!.Value);
                if (!enabled)
                {
                    suppressEvents = true;
                    EnabledSwitch.IsToggled = false;
                    suppressEvents = false;
                    await DisplayAlertAsync("Notifications blocked",
                        "Please allow notifications for 1K Words in your system settings.", "OK");
                }
            }
            else
            {
                ReminderService.Disable();
            }
            UpdateStatus();
        }

        private async void OnTimeChanged(object sender, System.ComponentModel.PropertyChangedEventArgs eventArgs)
        {
            if (suppressEvents || eventArgs.PropertyName != nameof(TimePicker.Time)) return;
            if (ReminderService.IsEnabled)
            {
                await ReminderService.EnableAsync(TimeSelector.Time!.Value); // re-schedule with new time
                UpdateStatus();
            }
        }

        private void UpdateStatus()
        {
            StatusLabel.Text = ReminderService.IsEnabled
                ? $"Reminder active every day at {ReminderService.ReminderTime:hh\\:mm}."
                : "Reminder is off.";
        }
    }
}
