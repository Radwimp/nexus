import { IsString, IsIn, IsOptional, IsNumberString } from 'class-validator';

export class PlaceOrderDto {
  @IsString()
  userId: string;

  @IsString()
  pair: string;

  @IsIn(['buy', 'sell'])
  side: 'buy' | 'sell';

  @IsIn(['limit', 'market'])
  orderType: 'limit' | 'market';

  @IsNumberString()
  price: string;

  @IsNumberString()
  quantity: string;
}
