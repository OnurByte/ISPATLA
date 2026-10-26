// ispatla.tr scans are owned by the systemd user timer. Starting one from every
// Next runtime would create a second, process-local scheduler over the same DB.
export function register() {}
