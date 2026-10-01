allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}

// Force every Flutter plugin subproject to compile against Android SDK 36.
//
// Why we need this on top of the app-level `compileSdk = 36` (see
// `app/build.gradle.kts`):
//   android_play_install_referrer 0.4.0 hardcodes `compileSdkVersion 33` in
//   its own `build.gradle`, so bumping the app's compileSdk isn't enough —
//   its transitive androidx deps (fragment 1.7.1, activity 1.8.1, lifecycle
//   2.7.0, core 1.13.1) require compileSdk 34+ and the plugin's AAR-metadata
//   check fails at build time with "compiled against android-33".
//
// MUST run BEFORE the `evaluationDependsOn(":app")` block below — that call
// forces every subproject to evaluate eagerly, and once a project is
// evaluated we can no longer register an `afterEvaluate` on it (Gradle
// throws "Cannot run Project.afterEvaluate(Action) when the project is
// already evaluated"). Placing this block here keeps subprojects
// un-evaluated at registration time.
//
// Only touches LibraryExtension (plugin modules); the app module uses
// ApplicationExtension and already sets its own compileSdk explicitly in
// `app/build.gradle.kts`.
subprojects {
    afterEvaluate {
        val android = extensions.findByName("android")
        if (android is com.android.build.gradle.LibraryExtension) {
            android.compileSdk = 36
            // AGP-9 workaround for media_kit_libs_android_video 1.3.8: the
            // plugin ships pure Java sources (android.util.Log,
            // android.content.Context, android.net.Uri) but its own
            // build.gradle's old-style `compileSdkVersion 36` + inside-android
            // `dependencies {}` block causes AGP 9 to skip adding android.jar
            // to the Java compile classpath. Force it back on for every
            // library subproject — cheap and idempotent for plugins that
            // already have it.
            tasks.withType<JavaCompile>().configureEach {
                doFirst {
                    classpath = classpath.plus(files(android.bootClasspath))
                }
            }
        }
    }
}

subprojects {
    project.evaluationDependsOn(":app")
}

// Force every Flutter plugin subproject to compile Kotlin against JVM 17.
// Without this, amplitude_flutter's own build.gradle.kts sets jvmTarget=1.8
// which is incompatible with the app's Java 17 → "Inconsistent JVM-target".
// gradle.projectsEvaluated runs AFTER every subproject's build.gradle.kts has
// executed, so our override wins the race against amplitude_flutter's own
// jvmTarget setting.
gradle.projectsEvaluated {
    subprojects {
        // Kotlin → JVM 17
        tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
            compilerOptions {
                jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
            }
        }
        // Java → 17. amplitude_flutter defaults javac to 11, which is
        // inconsistent with our Kotlin 17. Force parity here.
        tasks.withType<JavaCompile>().configureEach {
            sourceCompatibility = JavaVersion.VERSION_17.toString()
            targetCompatibility = JavaVersion.VERSION_17.toString()
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
