package com.chatlive.support.bootstrap;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = "com.chatlive.support")
@EnableScheduling
public class ChatLiveApplication {
    public static void main(String[] args) {
        SpringApplication.run(ChatLiveApplication.class, args);
    }
}
