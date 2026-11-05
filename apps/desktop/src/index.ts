export const DESKTOP_TARGET = "windows-nsis";

export function getDesktopPlatformInfo() {
  return {
    target: DESKTOP_TARGET,
    protocolHandler: "campusmesh://",
  };
}
