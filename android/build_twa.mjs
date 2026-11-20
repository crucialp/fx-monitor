// 환율 조회 안드로이드 앱(TWA) 빌드: https://fx-monitor.pages.dev/app/ 을 크롬 전체 화면으로 여는 앱.
// 사용: node build.mjs <프로젝트 폴더> <키 폴더> [버전코드] [버전이름]
import { Config, JdkHelper, AndroidSdkTools, TwaManifest, TwaGenerator, GradleWrapper, KeyTool, JarSigner, ConsoleLog } from "@bubblewrap/core";
import fs from "node:fs"; import { execSync } from "node:child_process"; import path from "node:path"; import crypto from "node:crypto";
const [DIR, KEYDIR, VC = "1", VN = "1.0.0"] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, ".bubblewrap", "config.json"), "utf8"));
const log = new ConsoleLog("build");
const config = new Config(cfg.jdkPath, cfg.androidSdkPath);
const jdk = new JdkHelper(process, config);
const sdk = await AndroidSdkTools.create(process, config, jdk, log);
fs.mkdirSync(DIR, { recursive: true }); fs.mkdirSync(KEYDIR, { recursive: true });
const ks = path.join(KEYDIR, "fx-monitor-upload.jks"), pwf = path.join(KEYDIR, "keystore-password.txt");
let pw;
if (!fs.existsSync(ks)) {
  pw = crypto.randomBytes(18).toString("base64url");
  fs.writeFileSync(pwf, pw + "\n");
  await new KeyTool(jdk, log).createSigningKey({ path: ks, alias: "upload", password: pw, keypassword: pw, fullName: "FX Monitor", organizationalUnit: "App", organization: "FX Monitor", country: "KR" });
} else pw = fs.readFileSync(pwf, "utf8").trim();
const twa = await TwaManifest.fromWebManifest("https://fx-monitor.pages.dev/app/manifest.webmanifest");
Object.assign(twa, {
  packageId: "dev.pages.fx_monitor.app", name: "환율 조회", launcherName: "환율 조회",
  themeColor: twa.themeColor, navigationColor: twa.themeColor, enableNotifications: true,
  appVersionCode: +VC, appVersionName: VN, fallbackType: "customtabs", minSdkVersion: 24,
  signingKey: { path: ks, alias: "upload" }, enableSiteSettingsShortcut: false,
});
await new TwaGenerator().createTwaProject(DIR, twa, log);
await twa.saveToFile(path.join(DIR, "twa-manifest.json"));
const g = { run: (t) => execSync(`"${path.join(DIR, "gradlew.bat")}" ${t} --stacktrace`, { cwd: DIR, env: sdk.getEnv(), stdio: ["ignore", "ignore", "inherit"] }) };
g.run("bundleRelease");
const aabIn = path.join(DIR, "app/build/outputs/bundle/release/app-release.aab"), aab = path.join(DIR, "app-release-bundle.aab");
await new JarSigner(jdk).sign({ path: ks, alias: "upload" }, pw, pw, aabIn, aab);
g.run("assembleRelease");
const apkIn = path.join(DIR, "app/build/outputs/apk/release/app-release-unsigned.apk"), al = path.join(DIR, "app-release-unsigned-aligned.apk"), apk = path.join(DIR, "app-release-signed.apk");
await sdk.zipalign(apkIn, al);
await sdk.apksigner(ks, pw, "upload", pw, al, apk);
const info = await new KeyTool(jdk, log).keyInfo({ path: ks, alias: "upload", password: pw, keypassword: pw });
console.log("SHA256", info.fingerprints.get("SHA256"));
console.log("DONE", aab, apk);
