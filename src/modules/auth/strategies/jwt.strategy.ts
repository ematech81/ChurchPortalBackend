import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

interface JwtPayload {
  sub: string;
  typ?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('app.jwtSecret'),
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload) {
    // A refresh token must never work as an access token (even if both secrets match).
    if (payload.typ === 'refresh') throw new UnauthorizedException();

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException();

    // Role and church come from the database, not the token, so demotions,
    // branch reassignments and deactivations take effect immediately.
    return {
      id: user.id,
      churchId: user.churchId,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
