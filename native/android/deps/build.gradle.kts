// Downloads the Firebase Cloud Messaging runtime so the hand-built Android host
// can compile against it.
//
// This is NOT a Gradle build of the app. `scripts/build-android-host.sh` still
// compiles the host with aapt2/javac/d8; Gradle's only job is resolving a
// dependency tree that a plain `curl` cannot (transitive AARs, exclusions,
// versions). The resolved artifacts land in `android/libs` and the host build
// treats that directory as its classpath.
//
// Bump the version here, run `scripts/fetch-android-libs.sh`, and commit the
// new `android/libs/manifest.txt`.

plugins {
    base
}

repositories {
    google()
    mavenCentral()
}

val runtime by configurations.creating {
    isCanBeConsumed = false
    isCanBeResolved = true
}

dependencies {
    runtime("com.google.firebase:firebase-messaging:26.0.1")
}

tasks.register<Sync>("copyDeps") {
    from(runtime)
    into(layout.projectDirectory.dir("../libs"))
}
