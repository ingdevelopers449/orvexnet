import crypto from 'crypto';
import axios from 'axios';
import { config } from '../config/env';

export class BinancePayService {
  private readonly baseUrl = 'https://bpay.binanceapi.com';
  private readonly apiKey = config.binancePay.apiKey;
  private readonly secretKey = config.binancePay.secretKey;
  private readonly merchantId = config.binancePay.merchantId;

  /**
   * Genera las cabeceras requeridas por la API de Binance Pay
   */
  private generateHeaders(body: any) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(32).toString('hex').substring(0, 32);
    
    // Construct payload for signature: timestamp + \n + nonce + \n + body + \n
    const payload = `${timestamp}\n${nonce}\n${JSON.stringify(body)}\n`;
    const signature = crypto
      .createHmac('sha512', this.secretKey)
      .update(payload)
      .digest('hex')
      .toUpperCase();

    return {
      'Content-Type': 'application/json',
      'BinancePay-Timestamp': timestamp,
      'BinancePay-Nonce': nonce,
      'BinancePay-Certificate-SN': this.apiKey,
      'BinancePay-Signature': signature
    };
  }

  /**
   * Consulta el estado de una orden por su prepayId o merchantTradeNo
   * Nota: Binance Pay v2 usa /binancepay/openapi/v2/order/query
   */
  async queryOrder(prepayId?: string, merchantTradeNo?: string) {
    if (!this.apiKey || !this.secretKey) {
      throw new Error('Binance Pay API keys are not configured');
    }

    const endpoint = '/binancepay/openapi/v2/order/query';
    const body: any = {};
    
    if (prepayId) body.prepayId = prepayId;
    if (merchantTradeNo) body.merchantTradeNo = merchantTradeNo;

    try {
      const response = await axios.post(`${this.baseUrl}${endpoint}`, body, {
        headers: this.generateHeaders(body)
      });
      return response.data;
    } catch (error: any) {
      console.error('Binance Pay API Error:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Valida manualmente si el estado de un pago es exitoso
   */
  isPaymentSuccessful(orderData: any): boolean {
    if (!orderData || orderData.status !== 'SUCCESS') return false;
    return orderData.data && orderData.data.status === 'SUCCESS';
  }
}
