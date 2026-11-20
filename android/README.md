# 환율 조회 안드로이드 앱 (TWA)

https://fx-monitor.pages.dev/app/ 을 크롬 엔진으로 전체 화면에 띄우는 플레이스토어용 앱. 화면·기능은 전부 웹(`cloudflare/public/app/`)이라
사이트를 고치면 앱도 바로 바뀐다. 이 폴더는 아이콘·이름·버전을 바꾸거나 새 버전을 올릴 때만 다시 빌드한다.

- 패키지 `dev.pages.fx_monitor.app`, 최소 안드로이드 7.0(SDK 24)
- 사이트 연결 확인: `cloudflare/public/.well-known/assetlinks.json` (업로드 키 지문 + Play 앱 서명 키 지문을 넣어야 주소창이 안 보임)
- 서명 키: 저장소 밖 `C:\Users\박도담\fx-app-signing\` (절대 커밋하지 않음)

## 다시 빌드(새 버전)
Windows 는 경로에 한글이 있으면 Gradle 빌드가 안 되므로 도구·작업 폴더를 `C:\fxapp-build\` 에 둔다.
- JDK 17: `C:\fxapp-build\jdk17`, Android SDK: `C:\fxapp-build\android_sdk`(build-tools 36.1.0, platforms android-36)
- `~/.bubblewrap/config.json` = `{"jdkPath":"C:/fxapp-build/jdk17","androidSdkPath":"C:/fxapp-build/android_sdk"}`
- `~/.bubblewrap/runner` 에 `npm i @bubblewrap/core` 후 `build_twa.mjs` 를 그 폴더에 두고:

```
JAVA_HOME='C:\fxapp-build\jdk17' PATH="/c/fxapp-build/jdk17/bin:$PATH" ANDROID_HOME='C:\fxapp-build\android_sdk' GRADLE_USER_HOME='C:\fxapp-build\.gradle' \
  node build_twa.mjs 'C:\fxapp-build\android' "C:/Users/박도담/fx-app-signing" <버전코드> <버전이름>
```
버전코드는 올릴 때마다 1씩 늘린다. 결과: `C:\fxapp-build\android\app-release-bundle.aab`(스토어용), `app-release-signed.apk`(직접 설치용).
