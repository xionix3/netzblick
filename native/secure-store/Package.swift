// swift-tools-version: 5.9
import PackageDescription

// Netzblick: Zugangsdaten im iOS-Schlüsselbund (JS-Name „SecureStore“, wie SecureStorePlugin.java unter Android)
let package = Package(
    name: "NetzblickSecureStore",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "NetzblickSecureStore",
            targets: ["SecureStorePlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "SecureStorePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/SecureStorePlugin")
    ]
)
