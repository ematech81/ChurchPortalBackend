import { Controller, Post, Body, Headers, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('initialize')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  initialize(@Body() body: { email: string; amount: number; plan: string }) {
    return this.billingService.initializeTransaction(body.email, body.amount * 100, {
      plan: body.plan,
    });
  }

  @Post('webhook')
  webhook(@Headers('x-paystack-signature') signature: string, @Body() body: unknown) {
    // TODO: verify HMAC signature and process payment events
    return { received: true };
  }
}
