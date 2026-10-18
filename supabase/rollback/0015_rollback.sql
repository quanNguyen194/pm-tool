-- Hoàn tác migration 0015: trả thời gian chờ Telegram về mặc định của pg_net (5 giây) như ở 0014.
create or replace function public.telegram_send(p_chat text, p_text text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare token text := public.telegram_secret('telegram_bot_token');
begin
  if token is null or token = '' then return null; end if;
  return net.http_post(
    url := 'https://api.telegram.org/bot' || token || '/sendMessage',
    body := jsonb_build_object('chat_id', p_chat, 'text', left(p_text, 4000), 'disable_web_page_preview', true),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end
$$;
