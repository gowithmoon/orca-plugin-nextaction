/**
 * How many days ahead an effective start may lie for a task to be a next
 * action already (the start preview setting, #56). Always a valid count of
 * days; read on every use, so a change in the settings applies without
 * restarting the plugin.
 */
export interface StartPreviewDaysSetting {
  current(): number;
}
