## Welcome to the AULA Toolkit contributing guide!

### Other language versions of this contributing guide:
* [Türkçe katkı rehberi](CONTRIBUTING_tr-TR.md)

Thanks for investing your time in contributing to this project! AULA Toolkit is maintained in spare time, so here are a few rules that help your contribution go smoothly.

<br/>

_Issues that do not follow these rules may be closed without further notice._

<br/>

**1. Before reporting an issue, read the README**

The [README](README.md) answers the most common questions in its [FAQ](README.md#faq) and lists the known limitations, such as no settings over Bluetooth. Take a moment to go through it before creating an issue.

**2. Check already reported issues**

Go through the [issues](https://github.com/livvaa/AulaToolkit/issues?q=is%3Aissue) that were already reported. Do not create duplicates. Even if an issue is closed, you can still leave a comment there. You can also talk about known issues on our [Discord server](https://discord.gg/u9FbaJGtCe).

**3. Use English or Turkish**

This makes it easier for everyone to follow the conversation.

**4. Respect the scope of the project**

AULA Toolkit aims to replace the official AULA software for AULA keyboards and mice, one app for all of them. Requests for devices of other brands, or for features unrelated to AULA devices, are out of scope.

**5. Verify your problem before creating an issue**

Make sure the problem is really in AULA Toolkit. Close the official AULA software first: two programs talking to the same device at once cause errors that are not bugs. Try another USB port or cable, and check whether the problem also happens with the official software.

**6. Describe your problem as best you can**

Include the AULA Toolkit version (**Settings → About**), your Windows version, the device and how it is connected (USB or 2.4 GHz receiver), what you did, what you expected and what happened instead. **Always attach a diagnostics bundle** (**Settings → About → Save diagnostics bundle**); see [How to collect logs?](README.md#how-to-collect-logs).

**7. Give issues a good title**

"S75 Pro: brightness resets after sleep over 2.4 GHz" is a good title. "Doesn't work" is not.

**8. Stay on topic**

Do not leave unnecessary comments or spam. Use the 👍 reaction instead of "+1" comments.

**9. One problem per issue**

Do not report many problems or request many features in one issue. Open one issue per problem or idea; this makes them easier to follow and close.

**10. Requesting support for a new device**

Most AULA devices reuse a protocol AULA Toolkit already speaks, so new models mostly need testers. In your request include:
* the full model name (for example *AULA F87 Pro*) and a link to the product page,
* the USB IDs from **Device Manager → your device → Properties → Details → Hardware Ids** (for example `VID_0C45&PID_800A`) for both the cable and the 2.4 GHz receiver,
* the name and version of the official AULA driver for the device,
* a diagnostics bundle with the device connected,
* whether you are willing to try test builds.

**11. Translations**

Each language is a single file in [`src/shared/locales`](src/shared/locales); [`en.ts`](src/shared/locales/en.ts) is the reference. Not all of them have been reviewed by native speakers yet, so corrections are very welcome. Keep placeholders such as `{name}` and the tone of the existing text. If you are not comfortable with Git, open an issue with your corrections instead.

**12. Pull requests**

Pull requests are welcome. Unless the change is small and obvious, open an issue first and describe the problem you are solving: it doesn't make sense to spend time on an idea that will be rejected because it doesn't fit the project. We encourage discussing larger changes on our [Discord server](https://discord.gg/u9FbaJGtCe) first. Follow the code style and architecture of the project, keep each pull request to one topic and say which devices and connections you tested on real hardware. Never send firmware-update or bootloader commands to a device, and do not guess protocol commands: start with read-only probes.

<br/>

### Building from source

You need Windows 10 or 11, [Node.js](https://nodejs.org/) 22 LTS and [Git](https://git-scm.com/).

```bash
git clone https://github.com/livvaa/AulaToolkit.git
cd AulaToolkit
npm install
npm run dev
```

No device at hand? Start with simulated devices: `$env:AULA_SIM = "s75pro,sc900,f75"; npm run dev` (PowerShell).

Before opening a pull request, run `npm run typecheck` and `npm test`. `npm run dist` builds the installer and the portable exe into `release/`.

By contributing, you agree that your contributions are licensed under the [GNU General Public License v3.0 or later](LICENSE).

<br/>

Once again, thanks for investing your time in helping AULA Toolkit get better!
