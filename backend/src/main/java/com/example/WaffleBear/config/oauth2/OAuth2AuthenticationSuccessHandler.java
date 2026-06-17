package com.example.WaffleBear.config.oauth2;

import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.TokenDto;
import com.example.WaffleBear.user.service.AuthService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class OAuth2AuthenticationSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final AuthService authService;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Value("${app.secure-cookie}")
    private boolean secureCookie;

    @Value("${app.cookie-domain:}")
    private String cookieDomain;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException, ServletException {
        AuthUserDetails user = (AuthUserDetails) authentication.getPrincipal();

        TokenDto.AuthTokenResponse tokens = authService.issueTokens(
                user.getIdx(),
                user.getId(),
                user.getEmail(),
                user.getName(),
                user.getRole()
        );

        Cookie refreshCookie = new Cookie("refresh", tokens.refreshToken());
        refreshCookie.setMaxAge(14 * 24 * 60 * 60);
        refreshCookie.setHttpOnly(true);
        refreshCookie.setPath("/");
        refreshCookie.setSecure(secureCookie);
        // 프론트(lumisia.*)와 API(api.*)가 다른 서브도메인이면 상위 도메인으로 공유해야
        // 콜백 이후 프론트에서 refresh 쿠키를 사용할 수 있다.
        if (cookieDomain != null && !cookieDomain.isBlank()) {
            refreshCookie.setDomain(cookieDomain);
        }
        response.addCookie(refreshCookie);

        String redirectUrl = frontendUrl + "/main?accessToken=" + tokens.accessToken();
        getRedirectStrategy().sendRedirect(request, response, redirectUrl);
    }
}
