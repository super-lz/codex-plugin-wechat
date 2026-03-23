export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonRpcId = string | number;

export type JsonRpcRequest<TParams = unknown> = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params: TParams;
};

export type JsonRpcSuccess<TResult = unknown> = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: TResult;
};

export type JsonRpcFailure = {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: {
    code: number;
    message: string;
    data?: JsonValue;
  };
};

export type JsonRpcNotification<TParams = unknown> = {
  jsonrpc: "2.0";
  method: string;
  params: TParams;
};

export type JsonRpcMessage =
  | JsonRpcSuccess
  | JsonRpcFailure
  | JsonRpcNotification
  | JsonRpcRequest;
