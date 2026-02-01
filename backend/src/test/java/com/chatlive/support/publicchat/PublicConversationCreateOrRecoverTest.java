package com.chatlive.support.publicchat;

import com.chatlive.support.bootstrap.ChatLiveApplication;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = ChatLiveApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("dev")
class PublicConversationCreateOrRecoverTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Test
    void create_then_recover() throws Exception {
        var token = bootstrapToken("pk_demo_change_me", "http://localhost:5173");

        // create
        var createRes = mvc.perform(post("/api/v1/public/conversations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.data.conversation_id").isNotEmpty())
                .andExpect(jsonPath("$.data.recovered").value(false))
                .andReturn();

        var conversationId = objectMapper.readTree(createRes.getResponse().getContentAsString())
                .path("data").path("conversation_id").asText();

        // detail
        mvc.perform(get("/api/v1/public/conversations/{id}", conversationId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.data.id").value(conversationId));

        // messages page (empty initially)
        mvc.perform(get("/api/v1/public/conversations/{id}/messages", conversationId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.data.messages").isArray());

        // HTTP fallback send message
        mvc.perform(post("/api/v1/public/conversations/{id}/messages", conversationId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"hello\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.data.id").isNotEmpty());

        // messages should include the sent one
        mvc.perform(get("/api/v1/public/conversations/{id}/messages", conversationId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.data.messages.length()").value(1));

        // recover
        mvc.perform(post("/api/v1/public/conversations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.data.conversation_id").isNotEmpty())
                .andExpect(jsonPath("$.data.recovered").value(true));
    }

    @Test
    void recover_closed_conversation_id_is_stable() throws Exception {
        var token = bootstrapToken("pk_demo_change_me", "http://localhost:5173");

        // create
        var createRes = mvc.perform(post("/api/v1/public/conversations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.data.conversation_id").isNotEmpty())
                .andReturn();

        var conversationId = objectMapper.readTree(createRes.getResponse().getContentAsString())
                .path("data").path("conversation_id").asText();

        // simulate agent close
        jdbcTemplate.update("update conversation set status='closed', closed_at=now() where id=?", conversationId);

        // recover should return the same id (even if closed)
        mvc.perform(post("/api/v1/public/conversations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.data.conversation_id").value(conversationId))
                .andExpect(jsonPath("$.data.recovered").value(true));
    }

    @Test
    void send_message_reopens_closed_conversation() throws Exception {
        var token = bootstrapToken("pk_demo_change_me", "http://localhost:5173");

        var createRes = mvc.perform(post("/api/v1/public/conversations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andReturn();

        var conversationId = objectMapper.readTree(createRes.getResponse().getContentAsString())
                .path("data").path("conversation_id").asText();

        // close it
        jdbcTemplate.update("update conversation set status='closed', closed_at=now() where id=?", conversationId);

        // visitor sends again -> should succeed
        mvc.perform(post("/api/v1/public/conversations/{id}/messages", conversationId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"hello again\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.data.id").isNotEmpty());

        // conversation should not remain closed
        var statusVal = jdbcTemplate.queryForObject(
                "select status from conversation where id = ?",
                String.class,
                conversationId
        );
        org.junit.jupiter.api.Assertions.assertNotEquals("closed", statusVal);
    }

    @Test
        void identity_required_when_pre_chat_enabled() throws Exception {
                // create a dedicated site with pre-chat enabled
        jdbcTemplate.update("insert into site(id, tenant_id, name, public_key, status, created_at) values ('site_no_anon','t1','NoAnon','pk_no_anon','active', now())");
        jdbcTemplate.update("insert into site_domain_allowlist(site_id, domain, created_at) values ('site_no_anon','localhost', now())");
                jdbcTemplate.update("insert into widget_config(site_id, pre_chat_enabled, theme_color, welcome_text, created_at, updated_at) values ('site_no_anon', true, null, null, now(), now())");

        var token = bootstrapToken("pk_no_anon", "http://localhost:5173");

        mvc.perform(post("/api/v1/public/conversations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.error").value("identity_required"));

        mvc.perform(post("/api/v1/public/conversations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Alice\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.data.conversation_id").isNotEmpty());
    }

    private String bootstrapToken(String siteKey, String origin) throws Exception {
        var res = mvc.perform(post("/api/v1/public/widget/bootstrap")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"site_key":"%s","origin":"%s"}
                                """.formatted(siteKey, origin)))
                .andExpect(status().isOk())
                .andReturn();

        var body = res.getResponse().getContentAsString();
        JsonNode json = objectMapper.readTree(body);
        return json.path("data").path("visitor_token").asText();
    }
}
