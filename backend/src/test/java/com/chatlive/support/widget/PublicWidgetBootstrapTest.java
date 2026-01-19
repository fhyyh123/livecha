package com.chatlive.support.widget;

import com.chatlive.support.bootstrap.ChatLiveApplication;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = ChatLiveApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("dev")
class PublicWidgetBootstrapTest {

    @Autowired
    MockMvc mvc;

    @Test
    void bootstrap_ok() throws Exception {
        mvc.perform(post("/api/v1/public/widget/bootstrap")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"site_key":"pk_demo_change_me","origin":"http://localhost:5173"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.data.visitor_token").isNotEmpty())
                .andExpect(jsonPath("$.data.visitor_id").isNotEmpty())
                .andExpect(jsonPath("$.data.site_id").value("site_demo"))
                .andExpect(jsonPath("$.data.tenant_id").value("t1"))
                .andExpect(jsonPath("$.data.widget_config.anonymous_enabled").value(true));
    }

    @Test
    void bootstrap_origin_not_allowed() throws Exception {
        mvc.perform(post("/api/v1/public/widget/bootstrap")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"site_key":"pk_demo_change_me","origin":"https://evil.example.com"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.error").value("origin_not_allowed"));
    }
}
