use tauri::Url;

/// Top-level navigation policy, deliberately not a website network firewall.
pub fn navigation_allowed(url: &Url, application_origin: &str) -> bool {
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return false;
    }
    let Ok(application) = Url::parse(application_origin) else {
        return false;
    };
    if url.origin() == application.origin() {
        return false;
    }
    // Protect loopback aliases of the app as well as its exact startup origin.
    let host = url
        .host_str()
        .unwrap_or("")
        .trim_matches(['[', ']'])
        .trim_end_matches('.');
    let loopback = host.eq_ignore_ascii_case("localhost")
        || host.ends_with(".localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback() || ip.is_unspecified() || matches!(ip, std::net::IpAddr::V6(v6) if v6.to_ipv4_mapped().is_some_and(|v4| v4.is_loopback())));
    !(loopback && url.port_or_known_default() == application.port_or_known_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protects_trailing_dot_and_ipv4_mapped_loopback_aliases() {
        for value in [
            "http://localhost.:4488/",
            "http://preview.localhost.:4488/",
            "http://[::ffff:127.0.0.1]:4488/",
            "http://0.0.0.0:4488/",
        ] {
            assert!(
                !navigation_allowed(&Url::parse(value).unwrap(), "http://127.0.0.1:4488"),
                "{value}"
            );
        }
    }
    #[test]
    fn permits_websites_and_explicit_local_previews_but_not_application_authority() {
        let application = "http://127.0.0.1:4488";
        for value in [
            "https://example.org/path",
            "http://localhost:3000/",
            "http://127.0.0.1:8080/",
        ] {
            assert!(
                navigation_allowed(&Url::parse(value).unwrap(), application),
                "{value}"
            );
        }
        for value in [
            "http://127.0.0.1:4488/",
            "http://localhost:4488/bootstrap?token=secret",
            "http://127.1:4488/api/state",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "tauri://localhost",
            "https://user:password@example.org/",
        ] {
            assert!(
                !navigation_allowed(&Url::parse(value).unwrap(), application),
                "{value}"
            );
        }
    }
}
