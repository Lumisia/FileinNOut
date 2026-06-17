package com.example.WaffleBear.config.oauth2;


import com.example.WaffleBear.utils.Aes256;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.commons.lang3.SerializationUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Duration;


@Component
public class OAuth2AuthorizationRequestRepository implements AuthorizationRequestRepository<OAuth2AuthorizationRequest> {

    // 프론트(lumisia.*)에서 시작한 OAuth가 API(api.*) 서브도메인으로 콜백되면 호스트 전용 쿠키는
    // 콜백에 실리지 않아 [authorization_request_not_found] 가 발생한다. 상위 도메인을 지정하면
    // 두 서브도메인이 OAUTH2_REQUEST 쿠키를 공유한다. 비우면 기존 호스트 전용 동작(localhost).
    private String cookieDomain = "";

    @Value("${app.cookie-domain:}")
    public void setCookieDomain(String cookieDomain) {
        this.cookieDomain = cookieDomain == null ? "" : cookieDomain.trim();
    }

    private void applyCookieScope(Cookie cookie) {
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        cookie.setSecure(true);
        if (!cookieDomain.isEmpty()) {
            cookie.setDomain(cookieDomain);
        }
    }

    @Override
    public OAuth2AuthorizationRequest loadAuthorizationRequest(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }

        for (Cookie cookie : cookies) {
            if (cookie.getName().equals("OAUTH2_REQUEST")) {
                OAuth2AuthorizationRequest oAuth2AuthorizationRequest =
                        (OAuth2AuthorizationRequest) SerializationUtils.deserialize(
                                Aes256.decrypt(cookie.getValue().getBytes(StandardCharsets.UTF_8))
                        );
                return oAuth2AuthorizationRequest;
            }
        }
        return null;
    }

    @Override
    public void saveAuthorizationRequest(OAuth2AuthorizationRequest authorizationRequest, HttpServletRequest request, HttpServletResponse response) {
        Cookie cookie = new Cookie("OAUTH2_REQUEST",
                Aes256.encrypt(SerializationUtils.serialize(authorizationRequest)));
        applyCookieScope(cookie);
        cookie.setMaxAge(((int) Duration.ofSeconds(300L).toSeconds()));
        response.addCookie(cookie);
    }

    @Override
    public OAuth2AuthorizationRequest removeAuthorizationRequest(HttpServletRequest request, HttpServletResponse response) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }

        for (Cookie cookie : cookies) {
            if (cookie.getName().equals("OAUTH2_REQUEST")) {
                OAuth2AuthorizationRequest oAuth2AuthorizationRequest =
                        (OAuth2AuthorizationRequest) SerializationUtils.deserialize(
                                Aes256.decrypt(cookie.getValue().getBytes(StandardCharsets.UTF_8))
                        );

                cookie.setValue("");
                applyCookieScope(cookie);
                cookie.setMaxAge(((int) Duration.ofSeconds(0L).toSeconds()));
                response.addCookie(cookie);

                return oAuth2AuthorizationRequest;
            }
        }
        return null;
    }
}
