import { Controller, Post, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { InitializeBillingDto } from './dto/initialize-billing.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { SENIOR_ROLES } from '../../constants/role-groups';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Starts a Paystack checkout. Price comes from the server-side plan table,
   * never from the client, and the payer is the signed-in Senior Pastor.
   */
  @Post('initialize')
  @ApiBearerAuth()
  @Roles(...SENIOR_ROLES)
  initialize(
    @CurrentUser() user: { id: string },
    @ChurchId() churchId: string,
    @Body() dto: InitializeBillingDto,
  ) {
    return this.billingService.initializeForChurch(user.id, churchId, dto.plan);
  }

  /** Paystack calls this; authenticity is the HMAC signature, not a JWT. */
  @Public()
  @Post('webhook')
  webhook(@Headers('x-paystack-signature') signature: string, @Body() body: unknown) {
    // TODO(billing phase): verify HMAC-SHA512 over the RAW body and update subscription status.
    // Until then the endpoint acknowledges but takes no action, so a forged call can change nothing.
    void signature;
    void body;
    return { received: true };
  }
}
