fn main() {
    // `tauri dev` launches the raw Cargo binary. Embed a plist so the macOS
    // Dock shows "Cursor Gateway" instead of the crate name.
    if cfg!(target_os = "macos") && std::env::var("PROFILE").as_deref() == Ok("debug") {
        let plist = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap())
            .join("Info.dev.plist");
        println!("cargo:rerun-if-changed=Info.dev.plist");
        println!(
            "cargo:rustc-link-arg=-Wl,-sectcreate,__TEXT,__info_plist,{}",
            plist.display()
        );
    }
    tauri_build::build()
}
