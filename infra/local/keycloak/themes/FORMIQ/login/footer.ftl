<#macro content>
    <footer class="mod-footer" data-preference-cookie-domain="${properties.preferenceCookieDomain!''}" data-pending-label="${msg('modPending')}"
        <#if message?has_content && message.summary == msg('loginTimeout')>
            data-restart-url="${url.loginRestartFlowUrl}" data-restart-label="${msg('modRestartLogin')}"
        </#if>>
        <div class="mod-footer-actions">
        <#if pageId == 'register'>
            <a class="mod-button mod-back" href="${url.loginUrl}" data-tooltip="${msg('modBack')}">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m10 5-7 7 7 7M3 12h18"/></svg>
                <span>${msg('modBackShort')}</span>
            </a>
        <#else>
            <a class="mod-button mod-home" href="${properties.appPublicUrl}/${(locale.currentLanguageTag!'pl')}" data-tooltip="${msg('modHome')}">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></svg>
                <span>${msg('modHome')}</span>
            </a>
        </#if>
        <#if realm.internationalizationEnabled && locale.supported?size gt 1>
            <#assign current = locale.currentLanguageTag!'pl'>
            <#list locale.supported as language>
                <#if language.languageTag != current>
                    <#assign next = language.languageTag>
                    <#assign switchLabel = msg((next == 'pl')?then('modSwitchPolish', 'modSwitchEnglish'))>
                    <a id="mod-locale" class="mod-button" href="${language.url}" aria-label="${switchLabel}"
                       data-current="${current}" data-next="${next}" data-resources="${url.resourcesPath}"
                       data-tooltip="${switchLabel}" data-tooltip-lang="${current}">
                        <img src="${url.resourcesPath}/img/flag-${current}.svg" alt="" width="24" height="12">
                        <span class="mod-locale-label" lang="${current}">${(current == 'pl')?then('Polski', 'English')}</span>
                    </a>
                </#if>
            </#list>
        </#if>
        <button id="mod-theme" class="mod-button" type="button" hidden
                data-system="${msg('modSystem')}" data-dark="${msg('modDark')}" data-light="${msg('modLight')}"
                data-label="${msg('modTheme')}">
            <span class="mod-theme-icon" aria-hidden="true"></span>
            <span class="mod-theme-label"></span>
        </button>
        </div>
        <small>© ${.now?string('yyyy')} FORMIQ</small>
    </footer>
</#macro>
