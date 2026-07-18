using Plugin.LocalNotification;
using Plugin.LocalNotification.Core.Models;

namespace VocabApp.Services
{
    /// <summary>
    /// Daily study reminder as a local notification. Enabled flag and time are
    /// stored in Preferences; the notification repeats daily at the chosen time.
    /// </summary>
    public static class ReminderService
    {
        private const string EnabledPreferenceKey = "reminderEnabled";
        private const string TimePreferenceKey = "reminderTimeMinutes"; // minutes since midnight
        private const int ReminderNotificationId = 1001;

        public static bool IsEnabled => Preferences.Default.Get(EnabledPreferenceKey, false);

        public static TimeSpan ReminderTime
        {
            get
            {
                int minutesSinceMidnight = Preferences.Default.Get(TimePreferenceKey, 19 * 60); // default 19:00
                return TimeSpan.FromMinutes(minutesSinceMidnight);
            }
        }

        public static async Task<bool> EnableAsync(TimeSpan timeOfDay)
        {
            bool permitted = await LocalNotificationCenter.Current.AreNotificationsEnabled();
            if (!permitted)
            {
                permitted = await LocalNotificationCenter.Current.RequestNotificationPermission();
            }
            if (!permitted) return false;

            Preferences.Default.Set(EnabledPreferenceKey, true);
            Preferences.Default.Set(TimePreferenceKey, (int)timeOfDay.TotalMinutes);
            await ScheduleAsync(timeOfDay);
            return true;
        }

        public static void Disable()
        {
            Preferences.Default.Set(EnabledPreferenceKey, false);
            LocalNotificationCenter.Current.Cancel(ReminderNotificationId);
        }

        /// <summary>Re-schedule on app start so the reminder survives reboots/updates.</summary>
        public static async Task RestoreAsync()
        {
            if (!IsEnabled) return;
            bool permitted = await LocalNotificationCenter.Current.AreNotificationsEnabled();
            if (permitted) await ScheduleAsync(ReminderTime);
        }

        private static async Task ScheduleAsync(TimeSpan timeOfDay)
        {
            LocalNotificationCenter.Current.Cancel(ReminderNotificationId);

            var now = DateTime.Now;
            var firstOccurrence = now.Date.Add(timeOfDay);
            if (firstOccurrence <= now) firstOccurrence = firstOccurrence.AddDays(1);

            var request = new NotificationRequest
            {
                NotificationId = ReminderNotificationId,
                Title = "1K Words",
                Description = "Time for a quick study session keep your streak alive!",
                Schedule = new NotificationRequestSchedule
                {
                    NotifyTime = firstOccurrence,
                    RepeatType = NotificationRepeat.Daily,
                },
            };
            await LocalNotificationCenter.Current.Show(request);
        }
    }
}
