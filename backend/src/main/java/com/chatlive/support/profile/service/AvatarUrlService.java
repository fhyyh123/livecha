package com.chatlive.support.profile.service;

import com.chatlive.support.chat.repo.AgentProfileRepository;
import com.chatlive.support.storage.s3.S3PresignService;
import com.chatlive.support.storage.s3.S3Properties;
import com.chatlive.support.user.repo.UserAccountRepository;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

@Service
public class AvatarUrlService {

    public record AgentAvatarView(
            String agent_user_id,
            String display_name,
            String avatar_url
    ) {
    }

    private final AgentProfileRepository agentProfileRepository;
    private final UserAccountRepository userAccountRepository;
    private final S3Properties s3Properties;
    private final ObjectProvider<S3PresignService> presignServiceProvider;

    public AvatarUrlService(
            AgentProfileRepository agentProfileRepository,
            UserAccountRepository userAccountRepository,
            S3Properties s3Properties,
            ObjectProvider<S3PresignService> presignServiceProvider
    ) {
        this.agentProfileRepository = agentProfileRepository;
        this.userAccountRepository = userAccountRepository;
        this.s3Properties = s3Properties;
        this.presignServiceProvider = presignServiceProvider;
    }

    public AgentAvatarView getAgentAvatarView(String agentUserId) {
        if (agentUserId == null || agentUserId.isBlank()) return null;

        var details = agentProfileRepository.findDetailsByUserId(agentUserId).orElse(null);
        var displayName = details == null ? null : details.displayName();
        if (displayName == null || displayName.isBlank()) {
            var u = userAccountRepository.findPublicById(agentUserId).orElse(null);
            displayName = u == null ? null : u.username();
        }

        String url = null;
        if (s3Properties.enabled()) {
            var bucket = details == null ? null : details.avatarBucket();
            var key = details == null ? null : details.avatarObjectKey();
            if (bucket != null && !bucket.isBlank() && key != null && !key.isBlank()) {
                var presign = presignServiceProvider.getIfAvailable();
                if (presign != null) {
                    url = presign.presignGet(bucket, key).url();
                }
            }
        }

        return new AgentAvatarView(agentUserId, displayName, url);
    }
}
