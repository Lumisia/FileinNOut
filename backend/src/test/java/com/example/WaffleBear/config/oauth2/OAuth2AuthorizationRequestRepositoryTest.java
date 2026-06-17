package com.example.WaffleBear.config.oauth2;

import com.example.WaffleBear.utils.Aes256;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

import static org.assertj.core.api.Assertions.assertThat;

class OAuth2AuthorizationRequestRepositoryTest {

    private OAuth2AuthorizationRequestRepository repository;

    @BeforeEach
    void setUp() {
        new Aes256().setSecretKey("aessecretkey01234567891011121314");
        repository = new OAuth2AuthorizationRequestRepository();
    }

    @Test
    void loadsEncryptedAuthorizationRequestCookie() {
        OAuth2AuthorizationRequest authorizationRequest = OAuth2AuthorizationRequest.authorizationCode()
                .authorizationUri("https://nid.naver.com/oauth2.0/authorize")
                .clientId("naver-client")
                .redirectUri("https://api.fileinnout.com/api/login/oauth2/code/naver")
                .state("state-123")
                .build();

        MockHttpServletResponse response = new MockHttpServletResponse();
        repository.saveAuthorizationRequest(authorizationRequest, new MockHttpServletRequest(), response);

        Cookie cookie = response.getCookie("OAUTH2_REQUEST");
        assertThat(cookie).isNotNull();

        MockHttpServletRequest callbackRequest = new MockHttpServletRequest();
        callbackRequest.setCookies(cookie);

        OAuth2AuthorizationRequest loaded = repository.loadAuthorizationRequest(callbackRequest);
        assertThat(loaded).isNotNull();
        assertThat(loaded.getAuthorizationUri()).isEqualTo(authorizationRequest.getAuthorizationUri());
        assertThat(loaded.getClientId()).isEqualTo(authorizationRequest.getClientId());
        assertThat(loaded.getRedirectUri()).isEqualTo(authorizationRequest.getRedirectUri());
        assertThat(loaded.getState()).isEqualTo(authorizationRequest.getState());
    }

    @Test
    void missingAuthorizationRequestCookieReturnsNull() {
        MockHttpServletRequest request = new MockHttpServletRequest();

        assertThat(repository.loadAuthorizationRequest(request)).isNull();
        assertThat(repository.removeAuthorizationRequest(request, new MockHttpServletResponse())).isNull();
    }

    @Test
    void savesCookieScopedToConfiguredParentDomain() {
        // 프론트(lumisia.*)에서 시작해 API(api.*)로 콜백될 때 쿠키를 공유하려면 상위 도메인이 필요하다.
        repository.setCookieDomain(".fileinnout.com");

        OAuth2AuthorizationRequest authorizationRequest = OAuth2AuthorizationRequest.authorizationCode()
                .authorizationUri("https://nid.naver.com/oauth2.0/authorize")
                .clientId("naver-client")
                .redirectUri("https://api.fileinnout.com/api/login/oauth2/code/naver")
                .state("state-123")
                .build();

        MockHttpServletResponse response = new MockHttpServletResponse();
        repository.saveAuthorizationRequest(authorizationRequest, new MockHttpServletRequest(), response);

        Cookie cookie = response.getCookie("OAUTH2_REQUEST");
        assertThat(cookie).isNotNull();
        assertThat(cookie.getDomain()).isEqualTo(".fileinnout.com");

        // 같은 상위 도메인을 공유하는 콜백 요청에서 인가 요청이 정상 로드된다.
        MockHttpServletRequest callbackRequest = new MockHttpServletRequest();
        callbackRequest.setCookies(cookie);
        assertThat(repository.loadAuthorizationRequest(callbackRequest)).isNotNull();
    }
}
