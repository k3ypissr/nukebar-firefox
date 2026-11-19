/* HackBar Mod Combined - compatibility shim.
   The v2.9 overlay references js/java.js but the file was never shipped.
   Java applet helpers are not used by any current menu item. */
if (typeof HackBar === "object") {
  HackBar.Java = HackBar.Java || {
    version: function () { return "unavailable"; }
  };
}
