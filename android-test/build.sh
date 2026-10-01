#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")" && pwd)"
sdk_dir="${1:?Informe o caminho do Android SDK}"
tools_dir="$sdk_dir/build-tools/35.0.0"
platform_jar="$sdk_dir/platforms/android-35/android.jar"
build_dir="$project_dir/build"
mkdir -p "$build_dir/classes" "$build_dir/dex"
if command -v javac >/dev/null; then
  javac -source 8 -target 8 -classpath "$platform_jar" -d "$build_dir/classes" "$project_dir/src/com/helpme/test/MainActivity.java"
else
  java -jar "${ECJ_JAR:?Informe ECJ_JAR ou instale um JDK}" -source 8 -target 8 -classpath "$platform_jar" -d "$build_dir/classes" "$project_dir/src/com/helpme/test/MainActivity.java"
fi
"$tools_dir/aapt" package -f -M "$project_dir/AndroidManifest.xml" -S "$project_dir/res" -I "$platform_jar" -F "$build_dir/unsigned.apk"
"$tools_dir/d8" --lib "$platform_jar" --min-api 23 --output "$build_dir/dex" "$build_dir/classes/com/helpme/test/MainActivity.class"
(cd "$build_dir/dex" && zip -q "$build_dir/unsigned.apk" classes.dex)
"$tools_dir/zipalign" -f 4 "$build_dir/unsigned.apk" "$build_dir/aligned.apk"
test_key="${HELPME_TEST_KEYSTORE:-$project_dir/../data/helpme-android-test.jks}"
mkdir -p "$(dirname "$test_key")"
if [ ! -f "$test_key" ]; then
  keytool -genkeypair -keystore "$test_key" -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 3650 -dname 'CN=Help.me Android Test, O=Help.me, C=BR'
fi
"$tools_dir/apksigner" sign --ks "$test_key" --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey --out "$build_dir/Helpme-teste-android.apk" "$build_dir/aligned.apk"
"$tools_dir/apksigner" verify --verbose "$build_dir/Helpme-teste-android.apk"
"$tools_dir/zipalign" -c 4 "$build_dir/Helpme-teste-android.apk"
"$tools_dir/aapt" dump badging "$build_dir/Helpme-teste-android.apk"
