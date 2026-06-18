package com.example.WaffleBear.order.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.demo.DemoAccessPolicy;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.order.model.dto.OrderDto;
import com.example.WaffleBear.order.repository.OrderRepository;
import com.example.WaffleBear.user.repository.UserRepository;
import io.portone.sdk.server.payment.PaymentClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class OrderServiceDemoProtectionTest {

    @Mock private OrderRepository orderRepository;
    @Mock private UserRepository userRepository;
    @Mock private ObjectProvider<PaymentClient> paymentClientProvider;
    @Mock private StoragePlanService storagePlanService;
    @Mock private DemoAccessPolicy demoAccessPolicy;
    @InjectMocks private OrderService service;

    @BeforeEach
    void setUp() {
        doThrow(BaseException.from(BaseResponseStatus.DEMO_PROTECTED_ACTION))
                .when(demoAccessPolicy).assertOrderAllowed("demo.viewer@fileinnout.com");
    }

    @Test
    void blocksOrderCreationBeforeLookingUpUser() {
        assertDemoRejected(() -> service.createOrder(
                "demo.viewer@fileinnout.com",
                new OrderDto.OrderRequest("PLUS")
        ));

        verify(userRepository, never()).findByEmail("demo.viewer@fileinnout.com");
    }

    @Test
    void blocksPaymentVerificationBeforeLookingUpOrder() {
        assertDemoRejected(() -> service.verifyAndCompleteOrder(
                "demo.viewer@fileinnout.com",
                new OrderDto.OrderVerifyRequest("payment-id", "order-id")
        ));

        verify(orderRepository, never()).findByOrderId("order-id");
    }

    private void assertDemoRejected(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action)
                .isInstanceOfSatisfying(BaseException.class, exception ->
                        assertThat(exception.getStatus()).isEqualTo(BaseResponseStatus.DEMO_PROTECTED_ACTION));
    }
}
