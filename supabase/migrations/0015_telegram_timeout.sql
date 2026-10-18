-- Omni Project Manager - 0015: tăng thời gian chờ khi gọi Telegram.
-- pg_net mặc định chờ 5 giây; từ máy chủ Supabase, Telegram đôi khi phản hồi chậm hơn nên bị báo
-- "Timeout of 5000 ms reached" dù tin có thể vẫn đã tới. Nâng lên 20 giây.
-- Hoàn tác: supabase/rollback/0015_rollback.sql

create or replace function public.telegram_send(p_chat text, p_text text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare token text := public.telegram_secret('telegram_bot_token');
begin
  if token is null or token = '' then return null; end if;
  return net.http_post(
    url := 'https://api.telegram.org/bot' || token || '/sendMessage',
    body := jsonb_build_object('chat_id', p_chat, 'text', left(p_text, 4000), 'disable_web_page_preview', true),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 20000
  );
end
$$;
