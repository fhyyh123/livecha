package com.chatlive.support.widget.service;

import com.chatlive.support.widget.repo.SiteDomainAllowlistRepository;
import com.chatlive.support.widget.repo.SiteRepository;
import com.chatlive.support.widget.repo.WidgetConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class SiteWizardService {

    public record CreatedSite(String siteId, String publicKey) {
    }

    private final SiteRepository siteRepository;
    private final SiteDomainAllowlistRepository allowlistRepository;
    private final WidgetConfigRepository widgetConfigRepository;

    public SiteWizardService(
            SiteRepository siteRepository,
            SiteDomainAllowlistRepository allowlistRepository,
            WidgetConfigRepository widgetConfigRepository
    ) {
        this.siteRepository = siteRepository;
        this.allowlistRepository = allowlistRepository;
        this.widgetConfigRepository = widgetConfigRepository;
    }

    @Transactional
    public CreatedSite createWizard(
            String tenantId,
            String siteName,
            String allowlistDomain,
            String themeColor,
            String welcomeText,
            String cookieDomain,
            String cookieSameSite
    ) {
        var publicKey = "pk_" + UUID.randomUUID().toString().replace("-", "");
        var site = siteRepository.create(tenantId, siteName, publicKey);

        // defaults
        widgetConfigRepository.upsert(
                site.id(),
            false,
                emptyToNull(themeColor),
                emptyToNull(welcomeText),
                emptyToNull(cookieDomain),
            emptyToNull(cookieSameSite),
            null,
            null,
            null,
            false,
            false
        );

        var domain = emptyToNull(allowlistDomain);
        if (domain != null) {
            allowlistRepository.addDomain(site.id(), domain);
        }

        return new CreatedSite(site.id(), site.publicKey());
    }

    private static String emptyToNull(String s) {
        if (s == null) return null;
        var t = s.trim();
        return t.isBlank() ? null : t;
    }
}
