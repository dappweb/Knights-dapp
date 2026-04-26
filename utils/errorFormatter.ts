export const formatContractError = (error: any): string => {
  if (!error) return 'Unknown error occurred';

  // Handle string errors directly
  if (typeof error === 'string') {
      if (error.includes('user rejected') || error.includes('User denied')) return 'User rejected the transaction';
      return error;
  }

  // Extract error message/code
  const message = error.message || '';
  const code = error.code;
  const reason = error.reason;
  const shortMessage = error.shortMessage || '';
  const combined = `${message} ${shortMessage} ${reason || ''}`.toLowerCase();

  const customErrorMap: Record<string, string> = {
    notregistered: '账户未注册，无法执行该操作',
    protocolpausederror: '协议已暂停，请稍后再试',
    zeroamount: '金额为 0，暂无可操作余额',
    insufficientbalance: '余额不足，无法提现',
    miningpooldepleted: '矿池余额不足，请联系管理员',
    checkintooearly: '签到间隔未到，请稍后再试',
  };

  for (const [key, text] of Object.entries(customErrorMap)) {
    if (combined.includes(key)) {
      return text;
    }
  }

  // 1. User Rejection
  if (
    message.includes('user rejected') || 
    message.includes('User denied') || 
    code === 'ACTION_REJECTED' || 
    code === 4001
  ) {
    return 'Transaction cancelled by user';
  }

  // 2. Insufficient Funds
  if (
    message.includes('insufficient funds') || 
    message.includes('exceeds balance') ||
    code === 'INSUFFICIENT_FUNDS'
  ) {
    return 'Insufficient funds for transaction';
  }

  // 3. Execution Reverted (Smart Contract Custom Errors)
  // Ethers v6 often puts the reason in 'reason' field or inside the message
  if (reason) {
      return `Transaction failed: ${reason}`;
  }
  
  if (message.includes('execution reverted')) {
    const match = message.match(/execution reverted:? (.*?)(?:\"|$)/);
    if (match && match[1]) {
        return `Transaction failed: ${match[1]}`;
    }
    if (combined.includes('require(false)') || combined.includes('data: "0x"') || combined.includes('data: 0x')) {
      return '合约执行失败（无详细回滚信息），常见原因：协议余额不足/地址配置错误/网络不匹配';
    }
    return 'Transaction failed: Execution reverted';
  }

  // 4. Missing Revert Data (Gas Estimation Failed)
  // This typically means the transaction will fail, but the node didn't return a reason.
  // Could be due to: logic error, requirement not met, or wrong address.
  if (message.includes('missing revert data') || code === 'CALL_EXCEPTION') {
      // Check if we have more info in the data
      if (error.data && error.data !== '0x') {
          return 'Transaction failed: Contract execution error';
      }
      return '合约调用失败且无回滚数据，请检查网络、合约地址和协议资金池余额';
  }

  // 5. Internal RPC Error
  if (message.includes('Internal JSON-RPC error')) {
      const match = message.match(/message":"(.*?)"/);
      if (match && match[1]) {
          return `RPC Error: ${match[1]}`;
      }
      return 'Internal Wallet/RPC Error';
  }

  // 6. Network Issues
  if (message.includes('Network Error') || code === 'NETWORK_ERROR') {
      return 'Network connection error. Please check your internet or RPC URL.';
  }

  // Fallback: Use the short message if available and readable
  if (message && message.length < 80 && !message.includes('{')) {
      return message;
  }

  // Final fallback
  return 'Transaction failed. Please check details in console.';
};
