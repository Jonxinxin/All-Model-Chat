
import React from 'react';

interface MessageListFooterProps {
    isLastMessageLoading: boolean;
    chatInputHeight: number;
}

export const MessageListFooter: React.FC<MessageListFooterProps> = React.memo(({ isLastMessageLoading, chatInputHeight }) => {
    const heightStyle = {
        height: isLastMessageLoading
            ? '85vh'
            : (chatInputHeight ? `${chatInputHeight + 20}px` : '160px'),
        transition: 'height 0.3s ease-out'
    };

    return <div style={heightStyle} />;
});
