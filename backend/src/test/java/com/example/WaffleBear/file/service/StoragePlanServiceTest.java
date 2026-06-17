package com.example.WaffleBear.file.service;

import com.example.WaffleBear.order.repository.OrderRepository;
import com.example.WaffleBear.user.repository.UserRepository;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class StoragePlanServiceTest {

    @Test
    void freePlanUsesPortfolioSafeLimits() {
        StoragePlanService service = new StoragePlanService(
                mock(OrderRepository.class),
                mock(UserRepository.class)
        );

        StoragePlanService.StorageQuota quota = service.resolveQuota((com.example.WaffleBear.user.model.User) null);

        assertThat(quota.totalQuotaBytes()).isEqualTo(100L * 1024 * 1024);
        assertThat(quota.maxUploadCount()).isEqualTo(1);
    }
}
