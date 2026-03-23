export type WechatCredentials = {
  token: string;
  baseUrl: string;
  cdnBaseUrl?: string;
  userId?: string;
  accountId?: string;
};

export type WechatCdnMedia = {
  encrypt_query_param?: string;
  aes_key?: string;
};

export type WechatMessageItem = {
  type: number;
  text_item?: { text?: string };
  image_item?: {
    media?: WechatCdnMedia;
    aeskey?: string;
  };
  file_item?: {
    media?: WechatCdnMedia;
    file_name?: string;
  };
};

export type WechatInboundMessage = {
  from_user_id?: string;
  to_user_id?: string;
  create_time_ms?: number;
  message_type?: number;
  message_state?: number;
  context_token?: string;
  item_list?: WechatMessageItem[];
};

export type WechatGetUpdatesResponse = {
  ret?: number;
  errmsg?: string;
  msgs?: WechatInboundMessage[];
  get_updates_buf?: string;
};
