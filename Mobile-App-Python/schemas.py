from pydantic import BaseModel
from typing import Optional, List

class BalanceAdjustRequest(BaseModel):
    user_id: str
    amount: float
    reason: Optional[str] = "Admin manual adjustment"

class UserStatusRequest(BaseModel):
    user_id: str
    status: str # ACTIVE, SUSPENDED, BANNED

class RefundOrderRequest(BaseModel):
    order_id: str

class DepositActionRequest(BaseModel):
    deposit_id: int
    action: str  # APPROVE or REJECT

class DirectDepositRequest(BaseModel):
    user_email_or_id: str
    amount: float
    tx_id: Optional[str] = "DIRECT-ADMIN"
    comments: Optional[str] = "Direct admin deposit"

class ServicePricingRequest(BaseModel):
    service_id: str
    cost_price: float
    sell_price: float

class BulkMarkupRequest(BaseModel):
    group_name: Optional[str] = None
    markup_percent: float

class TicketReplyRequest(BaseModel):
    ticket_id: int
    message: str

class TicketCloseRequest(BaseModel):
    ticket_id: int

class PaymentMethodRequest(BaseModel):
    method_name: str
    bank_name: str
    account_title: str
    account_number: str
    is_active: Optional[bool] = True

class WhatsAppSettingsRequest(BaseModel):
    number: str
    message: str
    enabled: bool

class SystemSettingsRequest(BaseModel):
    otp_expiry_minutes: int
